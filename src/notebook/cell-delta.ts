/**
 * Pure transforms from notebook changes to `doc.change` deltas in view coordinates.
 *
 * The analyzer applies a `doc.change`'s deltas in array order, each range valid against
 * the document BEFORE the change (analysis-core `applyDocChange`). VS Code meets that by
 * emitting deltas bottom-to-top, and so does every function here.
 */

import type { DocChangeDelta } from '../core/index';
import type { OffsetMap } from './offset-map';
import { cellBlock, cellHeader, type CellSource } from './text-view';

/**
 * One operation of a cell source change, in the Yjs delta format that JupyterLab's shared
 * cell model reports: keep `retain` characters, insert text, or delete characters.
 */
export type SourceOp = { retain: number } | { insert: string } | { delete: number };

export interface Edit {
  /** Offset into the OLD source. */
  at: number;
  deleteCount: number;
  text: string;
}

/** Collapse ops into non-overlapping edits against the old source, in ascending order. */
export function editsFromOps(ops: readonly SourceOp[]): Edit[] {
  const edits: Edit[] = [];
  let at = 0;
  for (const op of ops) {
    if ('retain' in op) {
      at += op.retain;
      continue;
    }
    const last = edits[edits.length - 1];
    const extend = last !== undefined && last.at + last.deleteCount === at;
    if ('delete' in op) {
      if (extend) last.deleteCount += op.delete;
      else edits.push({ at, deleteCount: op.delete, text: '' });
      at += op.delete;
    } else if (extend) {
      last.text += op.insert;
    } else {
      edits.push({ at, deleteCount: 0, text: op.insert });
    }
  }
  return edits.filter((edit) => edit.deleteCount > 0 || edit.text !== '');
}

/** Apply ops to a source string. */
export function applySourceOps(source: string, ops: readonly SourceOp[]): string {
  let result = source;
  for (const edit of editsFromOps(ops).reverse()) {
    result = result.slice(0, edit.at) + edit.text + result.slice(edit.at + edit.deleteCount);
  }
  return result;
}

/**
 * Deltas for an edit inside one cell's source.
 *
 * Work is proportional to the edited cell and the number of cells, never to the size of
 * the whole notebook, so the keystroke path stays fast on large notebooks.
 */
export function sourceEditDeltas(
  map: OffsetMap,
  cellIndex: number,
  oldSource: string,
  ops: readonly SourceOp[],
): DocChangeDelta[] {
  const edits = editsFromOps(ops);
  const deltas: DocChangeDelta[] = [];
  for (let i = edits.length - 1; i >= 0; i--) {
    const edit = edits[i]!;
    deltas.push({
      range: {
        start: map.viewPosition(cellIndex, oldSource, edit.at),
        end: map.viewPosition(cellIndex, oldSource, edit.at + edit.deleteCount),
      },
      text: edit.text,
    });
  }
  return deltas;
}

function sameCell(a: CellSource, b: CellSource): boolean {
  return a.id === b.id && a.cell_type === b.cell_type && a.source === b.source;
}

/**
 * Deltas for a change to the cell list: cells added, deleted, moved, or changed type.
 * Source edits arrive separately through {@link sourceEditDeltas}.
 *
 * A change that only alters cell types rewrites just those header lines. Anything else
 * replaces the blocks between the unchanged leading and trailing cells, so a deletion or
 * insertion touches only the cells involved.
 */
export function cellListDeltas(
  map: OffsetMap,
  before: readonly CellSource[],
  after: readonly CellSource[],
): DocChangeDelta[] {
  const typesOnly =
    before.length === after.length &&
    before.every((cell, i) => {
      const next = after[i]!;
      return cell.id === next.id && cell.source === next.source;
    });

  if (typesOnly) {
    const deltas: DocChangeDelta[] = [];
    for (let i = before.length - 1; i >= 0; i--) {
      const cell = before[i]!;
      const next = after[i]!;
      if (cell.cell_type === next.cell_type) continue;
      const line = map.blockStartLine(i);
      deltas.push({
        range: { start: { line, character: 0 }, end: { line: line + 1, character: 0 } },
        text: cellHeader(next),
      });
    }
    return deltas;
  }

  let head = 0;
  while (head < before.length && head < after.length && sameCell(before[head]!, after[head]!)) {
    head++;
  }
  let tailBefore = before.length;
  let tailAfter = after.length;
  while (
    tailBefore > head &&
    tailAfter > head &&
    sameCell(before[tailBefore - 1]!, after[tailAfter - 1]!)
  ) {
    tailBefore--;
    tailAfter--;
  }
  if (head === tailBefore && head === tailAfter) return [];

  let text = '';
  for (let i = head; i < tailAfter; i++) text += cellBlock(after[i]!);
  const startLine = map.blockStartLine(head);
  const endLine = map.blockStartLine(tailBefore);
  return [
    {
      range: { start: { line: startLine, character: 0 }, end: { line: endLine, character: 0 } },
      text,
    },
  ];
}
