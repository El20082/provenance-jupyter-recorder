/**
 * Notebook changes to doc.* events, recorded as the `ipynb-source-v1` text view.
 *
 * Mirrors the VS Code recorder's doc-wiring: doc.open seeds reconstruction, each edit is a
 * doc.change of view deltas, doc.save carries the hash of the saved view, and doc.close
 * ends the document. Every event goes through the SessionHost, so it is chained.
 *
 * `jupyter-documents.ts` calls these methods from JupyterLab's shared-model signals.
 * Everything here is synchronous and does no I/O.
 *
 * Not here, by design:
 * - paste, selection, focus and heartbeat events: their own modules, in Task 6;
 * - session.start / session.end: the session lifecycle, in Task 4;
 * - cell execution and kernel events: not part of the format (decisions 1 and 10).
 */

import { sha256Hex, type DocChangeDelta } from '../../core/index';
import {
  cellListDeltas,
  applySourceOps,
  sourceEditDeltas,
  type SourceOp,
} from '../../notebook/cell-delta';
import { OffsetMap } from '../../notebook/offset-map';
import { checkCells, textView, type CellSource, type ViewProblem } from '../../notebook/text-view';
import { viewOfSavedNotebook } from '../../notebook/view-save';
import { docOpenPayload } from '../events/doc-events';
import type { SessionHost } from '../session/session-host';

export { MAX_INLINE_BYTES } from '../events/doc-events';

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

    this.host.emit('doc.open', docOpenPayload(path, textView(copy)));
    return { ok: true };
  }

  /**
   * A cell's source changed. `ops` is the Yjs-format delta of that change.
   *
   * `currentSource`, when given, is the cell's source after the change, read from the shared
   * model. It guards against signals arriving in an unexpected order: a change this wiring
   * has already absorbed (through `cellsChanged`) is skipped, and one that does not line up
   * becomes a single edit setting the cell to `currentSource`. Either way the recorded view
   * stays exact. `ops` of `null` means the delta could not be read, so only the whole-cell
   * edit is possible.
   */
  sourceChanged(
    path: string,
    cellId: string,
    ops: readonly SourceOp[] | null,
    currentSource?: string,
  ): void {
    const notebook = this.open.get(path);
    if (notebook === undefined) return;
    const index = notebook.cells.findIndex((cell) => cell.id === cellId);
    const cell = notebook.cells[index];
    if (cell === undefined) return;
    if (currentSource !== undefined && cell.source === currentSource) return;

    let effective = ops;
    if (
      effective === null ||
      (currentSource !== undefined && applySourceOps(cell.source, effective) !== currentSource)
    ) {
      if (currentSource === undefined) return;
      effective = [{ delete: cell.source.length }, { insert: currentSource }];
    }
    const deltas = sourceEditDeltas(notebook.map, index, cell.source, effective);
    cell.source = applySourceOps(cell.source, effective);
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

  /**
   * The notebook was saved. `savedText` is the file as written to disk, or `null` when it could
   * not be read back. A save is always recorded, as in VS Code: when the saved file cannot be
   * read or is not a recordable notebook, doc.save carries the hash of the view held here.
   */
  saved(path: string, savedText: string | null): void {
    const notebook = this.open.get(path);
    if (notebook === undefined) return;
    const saved = savedText === null ? null : viewOfSavedNotebook(savedText);
    const sha256 = saved?.ok === true ? saved.sha256 : sha256Hex(textView(notebook.cells));
    this.host.emit('doc.save', { path, sha256 });
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
