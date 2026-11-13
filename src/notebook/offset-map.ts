/**
 * Translates a position inside one cell's source into a line/character position in the
 * text view, without rescanning the whole notebook on every keystroke.
 *
 * Each cell's block occupies `2 + (newlines in its source)` view lines: the header line,
 * the source lines, and the line the block's final "\n" opens, on which the next block
 * starts. The map caches each cell's newline count, so locating a block costs one pass
 * over the cell list, and an edit only rescans the edited cell.
 *
 * Characters are UTF-16 code units, matching log-core's `Position` and JavaScript strings.
 */

import type { Position } from '../core/index';
import type { CellSource } from './text-view';

export function countNewlines(text: string, end: number = text.length): number {
  let count = 0;
  let at = text.indexOf('\n');
  while (at !== -1 && at < end) {
    count++;
    at = text.indexOf('\n', at + 1);
  }
  return count;
}

/** The line/character of `offset` within `source`, relative to the source's first line. */
export function positionInSource(source: string, offset: number): Position {
  const line = countNewlines(source, offset);
  const lineStart = offset === 0 ? 0 : source.lastIndexOf('\n', offset - 1) + 1;
  return { line, character: offset - lineStart };
}

export class OffsetMap {
  private newlines: number[];

  constructor(cells: readonly CellSource[]) {
    this.newlines = cells.map((cell) => countNewlines(cell.source));
  }

  /** View line of the header of the cell at `index`. */
  blockStartLine(index: number): number {
    let line = 0;
    for (let i = 0; i < index; i++) line += 2 + (this.newlines[i] ?? 0);
    return line;
  }

  /** View position of `offset` inside the source of the cell at `index`. */
  viewPosition(index: number, source: string, offset: number): Position {
    const inSource = positionInSource(source, offset);
    return { line: this.blockStartLine(index) + 1 + inSource.line, character: inSource.character };
  }

  /** Record that the cell at `index` now has `source`. */
  updateCell(index: number, source: string): void {
    this.newlines[index] = countNewlines(source);
  }

  /** Rebuild after cells were added, removed or reordered. */
  reset(cells: readonly CellSource[]): void {
    this.newlines = cells.map((cell) => countNewlines(cell.source));
  }
}
