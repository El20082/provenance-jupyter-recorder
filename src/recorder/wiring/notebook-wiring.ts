/**
 * Notebook changes to doc.* events, recorded as the `ipynb-source-v1` text view.
 *
 * Mirrors the VS Code recorder's doc-wiring: doc.open seeds reconstruction, each edit is a
 * doc.change of view deltas, doc.save carries the hash of the saved view, and doc.close
 * ends the document. Every event goes through the SessionHost, so it is chained.
 *
 * The JupyterLab side (ISharedNotebook / ISharedCell signals) calls these methods; it is
 * wired in a later task. Everything here is synchronous and does no I/O.
 *
 * Not here, by design:
 * - paste, selection, focus and heartbeat events: their own modules, in Task 6;
 * - session.start / session.end: the session lifecycle, in Task 4;
 * - cell execution and kernel events: not part of the format (decisions 1 and 10).
 */

import { sha256Hex } from '../../core/index';
import type { DocChangeDelta, DocOpenPayload } from '../../core/index';
import {
  cellListDeltas,
  applySourceOps,
  sourceEditDeltas,
  type SourceOp,
} from '../../notebook/cell-delta';
import { OffsetMap } from '../../notebook/offset-map';
import { checkCells, textView, type CellSource, type ViewProblem } from '../../notebook/text-view';
import { viewOfSavedNotebook } from '../../notebook/view-save';
import type { SessionHost } from '../session/session-host';

/**
 * doc.open inlines content up to this many UTF-8 bytes, as the VS Code recorder does
 * (`inline-content-limits.ts`). Copied, not imported: whether shared recorder helpers move
 * into a package is open decision 7.
 */
export const MAX_INLINE_BYTES = 64 * 1024;

export type OpenResult = { ok: true } | { ok: false; reason: ViewProblem | 'already_open' };

interface OpenNotebook {
  cells: CellSource[];
  map: OffsetMap;
}

export class NotebookWiring {
  private readonly open = new Map<string, OpenNotebook>();

  constructor(private readonly host: Pick<SessionHost, 'emit'>) {}

  isOpen(path: string): boolean {
    return this.open.has(path);
  }

  /** A notebook was opened. Notebooks whose cells lack unique ids are not recorded. */
  opened(path: string, cells: readonly CellSource[]): OpenResult {
    if (this.open.has(path)) return { ok: false, reason: 'already_open' };
    const problem = checkCells(cells);
    if (problem !== null) return { ok: false, reason: problem };

    const copy = cells.map((cell) => ({ ...cell }));
    this.open.set(path, { cells: copy, map: new OffsetMap(copy) });

    const view = textView(copy);
    const payload: DocOpenPayload = {
      path,
      sha256: sha256Hex(view),
      line_count: view.split('\n').length,
    };
    if (new TextEncoder().encode(view).length <= MAX_INLINE_BYTES) payload.content = view;
    else payload.truncated = true;
    this.host.emit('doc.open', payload);
    return { ok: true };
  }

  /** A cell's source changed. `ops` is the Yjs-format delta of that change. */
  sourceChanged(path: string, cellId: string, ops: readonly SourceOp[]): void {
    const notebook = this.open.get(path);
    if (notebook === undefined) return;
    const index = notebook.cells.findIndex((cell) => cell.id === cellId);
    const cell = notebook.cells[index];
    if (cell === undefined) return;

    const deltas = sourceEditDeltas(notebook.map, index, cell.source, ops);
    cell.source = applySourceOps(cell.source, ops);
    notebook.map.updateCell(index, cell.source);
    this.emitChange(path, deltas);
  }

  /** Cells were added, deleted, moved or changed type. `cells` is the new full list. */
  cellsChanged(path: string, cells: readonly CellSource[]): void {
    const notebook = this.open.get(path);
    if (notebook === undefined || checkCells(cells) !== null) return;

    const next = cells.map((cell) => ({ ...cell }));
    const deltas = cellListDeltas(notebook.map, notebook.cells, next);
    notebook.cells = next;
    notebook.map.reset(next);
    this.emitChange(path, deltas);
  }

  /** The notebook was saved. `savedText` is the file as written to disk. */
  saved(path: string, savedText: string): void {
    if (!this.open.has(path)) return;
    const saved = viewOfSavedNotebook(savedText);
    if (!saved.ok) return;
    this.host.emit('doc.save', { path, sha256: saved.sha256 });
  }

  closed(path: string): void {
    if (!this.open.delete(path)) return;
    this.host.emit('doc.close', { path });
  }

  private emitChange(path: string, deltas: DocChangeDelta[]): void {
    if (deltas.length === 0) return;
    // `source` is always 'typed' until paste reconciliation lands (Task 6), as in VS Code.
    this.host.emit('doc.change', { path, deltas, source: 'typed' });
  }
}
