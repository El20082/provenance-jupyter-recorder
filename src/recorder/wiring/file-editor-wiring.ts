/**
 * Plain text files (`.py`, `.csv` and so on) to doc.* events, recorded as VS Code records them.
 *
 * The file-editor counterpart of `NotebookWiring`: doc.open seeds reconstruction, each edit is
 * a doc.change, doc.save carries the hash of the file as saved, and doc.close ends it. Paths
 * are assignment-relative. `jupyter-documents.ts` calls these methods from JupyterLab's
 * shared-model signals. Synchronous, no I/O.
 */

import type { DocChangeDelta } from '../../core/index';
import { applySourceOps, type SourceOp } from '../../notebook/cell-delta';
import { docOpenPayload, docSavePayload, textEditDeltas } from '../events/doc-events';
import type { SessionHost } from '../session/session-host';

export class FileWiring {
  private readonly open = new Map<string, { text: string }>();

  constructor(private readonly host: Pick<SessionHost, 'emit'>) {}

  isOpen(path: string): boolean {
    return this.open.has(path);
  }

  opened(path: string, text: string): void {
    if (this.open.has(path)) return;
    this.open.set(path, { text });
    this.host.emit('doc.open', docOpenPayload(path, text));
  }

  /**
   * The file's text changed. Same contract as `NotebookWiring.sourceChanged`: with
   * `currentText`, an already-absorbed change is skipped and a mismatched one becomes a single
   * whole-file edit, so the recorded text stays exact.
   */
  sourceChanged(path: string, ops: readonly SourceOp[] | null, currentText?: string): void {
    const file = this.open.get(path);
    if (file === undefined) return;
    if (currentText !== undefined && file.text === currentText) return;

    let effective = ops;
    if (
      effective === null ||
      (currentText !== undefined && applySourceOps(file.text, effective) !== currentText)
    ) {
      if (currentText === undefined) return;
      effective = [{ delete: file.text.length }, { insert: currentText }];
    }
    const deltas = textEditDeltas(file.text, effective);
    file.text = applySourceOps(file.text, effective);
    this.emitChange(path, deltas);
  }

  /**
   * The file was saved. `savedText` is the file as written to disk, or `null` when it could not
   * be read back. A save is always recorded, as in VS Code: an unreadable save carries the hash
   * of the text held here.
   */
  saved(path: string, savedText: string | null): void {
    const file = this.open.get(path);
    if (file === undefined) return;
    this.host.emit('doc.save', docSavePayload(path, savedText ?? file.text));
  }

  closed(path: string): void {
    if (!this.open.delete(path)) return;
    this.host.emit('doc.close', { path });
  }

  private emitChange(path: string, deltas: DocChangeDelta[]): void {
    if (deltas.length === 0) return;
    this.host.emit('doc.change', { path, deltas, source: 'typed' });
  }
}
