import { describe, expect, it } from 'vitest';
import { OffsetMap, countNewlines, positionInSource } from '../../src/notebook/offset-map';
import type { CellSource } from '../../src/notebook/text-view';

const cells: CellSource[] = [
  { id: 'a', cell_type: 'code', source: 'x = 1\ny = 2' },
  { id: 'b', cell_type: 'markdown', source: '' },
  { id: 'c', cell_type: 'code', source: 'z' },
];

describe('countNewlines and positionInSource', () => {
  it('counts newlines before an offset', () => {
    expect(countNewlines('a\nb\nc')).toBe(2);
    expect(countNewlines('a\nb\nc', 2)).toBe(1);
  });

  it('maps an offset to a line and character', () => {
    expect(positionInSource('x = 1\ny = 2', 0)).toEqual({ line: 0, character: 0 });
    expect(positionInSource('x = 1\ny = 2', 8)).toEqual({ line: 1, character: 2 });
  });
});

describe('OffsetMap', () => {
  it('finds each block start line', () => {
    const map = new OffsetMap(cells);
    expect([0, 1, 2, 3].map((i) => map.blockStartLine(i))).toEqual([0, 3, 5, 7]);
  });

  it('places source positions one line below the header', () => {
    const map = new OffsetMap(cells);
    expect(map.viewPosition(2, 'z', 1)).toEqual({ line: 6, character: 1 });
  });

  it('follows newline changes in one cell', () => {
    const map = new OffsetMap(cells);
    map.updateCell(0, 'x = 1');
    expect(map.blockStartLine(2)).toBe(4);
  });
});
