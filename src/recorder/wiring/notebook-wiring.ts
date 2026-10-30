/**
 * ISharedNotebook and ISharedCell signals to doc.* events.
 *
 * TODO: not implemented. See docs/design.md.
 */

import { sha256Hex } from '../../core/index.ts';
import { textView, type CellSource } from '../../notebook/text-view.ts';
import { SessionHost } from '../session/session-host.ts';

export interface Scheduler {
  every(fn: () => void, milliseconds: number): () => void;
}

export class ActivityRecorder {
  private notebooks = new Map<string, CellSource[]>();

  private executions = new Map<
    string,
    {
      path: string;
      cell_id: string;
      source: string;
    }
  >();

  private stopped = false;
  private cancel: () => void;

  constructor(
    private host: SessionHost,
    scheduler: Scheduler,
    heartbeatMs = 30000,
  ) {
    if (!Number.isFinite(heartbeatMs) || heartbeatMs <= 0) {
      throw new Error('Invalid heartbeat interval');
    }

    host.emit('session.start', {
      host: { editor: 'jupyterlab' },
    });

    this.cancel = scheduler.every(() => {
      this.emit('session.heartbeat', {});
    }, heartbeatMs);
  }

  private emit(
    type: string,
    payload: Record<string, unknown>,
  ): void {
    if (!this.stopped) {
      this.host.emit(type, payload);
    }
  }

  private validate(cells: CellSource[]): void {
    const missingId = cells.some(cell => !cell.id);
    const duplicateId =
      new Set(cells.map(cell => cell.id)).size !== cells.length;

    if (missingId || duplicateId) {
      throw new Error('Cell IDs must be present and unique');
    }
  }

  open(path: string, cells: CellSource[]): void {
    if (this.stopped || this.notebooks.has(path)) {
      return;
    }

    this.validate(cells);
    this.notebooks.set(path, structuredClone(cells));

    const content = textView(cells);

    this.emit('doc.open', {
      path,
      view: 'ipynb-source-v1',
      content,
      sha256: sha256Hex(content),
      line_count: content.split('\n').length,
    });
  }

  /**
   * Reconcile source edits, cell additions/deletions,
   * moves, and cell type changes.
   */
  update(path: string, cells: CellSource[]): void {
    const previous = this.notebooks.get(path);

    if (this.stopped || !previous) {
      return;
    }

    this.validate(cells);

    const before = textView(previous);
    const after = textView(cells);

    if (before === after) {
      return;
    }

    this.notebooks.set(path, structuredClone(cells));

    // Find the shared prefix.
    let start = 0;

    while (
      start < before.length &&
      start < after.length &&
      before[start] === after[start]
    ) {
      start++;
    }

    // Find the shared suffix.
    let endBefore = before.length;
    let endAfter = after.length;

    while (
      endBefore > start &&
      endAfter > start &&
      before[endBefore - 1] === after[endAfter - 1]
    ) {
      endBefore--;
      endAfter--;
    }

    const oldCells = new Map(
      previous.map(cell => [cell.id, cell]),
    );

    const newCells = new Map(
      cells.map(cell => [cell.id, cell]),
    );

    const changedIds = cells
      .filter(cell => oldCells.get(cell.id)?.source !== cell.source)
      .map(cell => cell.id);

    // Internal UTF-16 offset delta.
    // Conversion to upstream line/character ranges is still needed.
    this.emit('doc.change', {
      path,
      offset: start,
      delete_count: endBefore - start,
      text: after.slice(start, endAfter),
      cell_ids: changedIds,
    });

    const added = cells
      .filter(cell => !oldCells.has(cell.id))
      .map(cell => cell.id);

    const removed = previous
      .filter(cell => !newCells.has(cell.id))
      .map(cell => cell.id);

    const typeChanges = cells
      .filter(cell => {
        const oldCell = oldCells.get(cell.id);

        return oldCell && oldCell.cell_type !== cell.cell_type;
      })
      .map(cell => ({
        cell_id: cell.id,
        before: oldCells.get(cell.id)!.cell_type,
        after: cell.cell_type,
      }));

    const commonBefore = previous
      .filter(cell => newCells.has(cell.id))
      .map(cell => cell.id);

    const commonAfter = cells
      .filter(cell => oldCells.has(cell.id))
      .map(cell => cell.id);

    const reordered = commonBefore.some(
      (id, index) => id !== commonAfter[index],
    );

    if (
      added.length > 0 ||
      removed.length > 0 ||
      typeChanges.length > 0 ||
      reordered
    ) {
      this.emit('notebook.cells.change', {
        path,
        added,
        removed,
        type_changes: typeChanges,
        order: cells.map(cell => cell.id),
      });
    }
  }

  paste(
    path: string,
    cellId: string,
    text: string,
    selection: unknown,
  ): void {
    const exists = this.notebooks
      .get(path)
      ?.some(cell => cell.id === cellId);

    if (!exists) {
      return;
    }

    this.emit('paste', {
      path,
      cell_id: cellId,
      text,
      size_utf16: text.length,
      selection,
    });
  }

  selection(
    path: string,
    cellId: string,
    selections: unknown,
  ): void {
    const exists = this.notebooks
      .get(path)
      ?.some(cell => cell.id === cellId);

    if (!exists) {
      return;
    }

    this.emit('selection.change', {
      path,
      cell_id: cellId,
      selections,
    });
  }

  save(path: string, savedCells: CellSource[]): void {
    if (this.stopped || !this.notebooks.has(path)) {
      return;
    }

    this.validate(savedCells);

    const content = textView(savedCells);

    this.emit('doc.save', {
      path,
      content,
      view: 'ipynb-source-v1',
      sha256: sha256Hex(content),
    });
  }

  execute(
    path: string,
    cellId: string,
    executionId: string,
  ): void {
    const cell = this.notebooks
      .get(path)
      ?.find(cell => cell.id === cellId);

    if (this.stopped || !cell || cell.cell_type !== 'code') {
      return;
    }

    if (this.executions.has(executionId)) {
      throw new Error('Duplicate execution ID');
    }

    const execution = {
      path,
      cell_id: cellId,
      source: cell.source,
    };

    this.executions.set(executionId, execution);

    this.emit('cell.execution.start', {
      ...execution,
      execution_id: executionId,
    });
  }

  executed(executionId: string, success: boolean): void {
    const execution = this.executions.get(executionId);

    if (!execution) {
      return;
    }

    this.executions.delete(executionId);

    this.emit('cell.execution.end', {
      ...execution,
      execution_id: executionId,
      success,
    });
  }

  focus(active: boolean, path?: string): void {
    this.emit('focus.change', {
      active,
      path: path ?? null,
    });
  }

  kernel(
    path: string,
    action: string,
    kernelId: string | null,
  ): void {
    if (!this.notebooks.has(path)) {
      return;
    }

    this.emit('kernel.lifecycle', {
      path,
      action,
      kernel_id: kernelId,
    });
  }

  close(path: string): void {
    if (!this.notebooks.delete(path)) {
      return;
    }

    this.emit('doc.close', { path });

    for (const [id, execution] of this.executions) {
      if (execution.path === path) {
        this.executions.delete(id);
      }
    }
  }

  async dispose(): Promise<void> {
    if (!this.stopped) {
      this.cancel();

      for (const path of [...this.notebooks.keys()]) {
        this.close(path);
      }

      this.emit('session.end', {});
      this.stopped = true;
    }

    await this.host.flush();
  }
}
