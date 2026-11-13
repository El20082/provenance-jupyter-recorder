import { describe, expect, it } from 'vitest';
import {
  applySourceOps,
  cellListDeltas,
  sourceEditDeltas,
  type SourceOp,
} from '../../src/notebook/cell-delta';
import { OffsetMap } from '../../src/notebook/offset-map';
import { textView, type CellSource } from '../../src/notebook/text-view';
import { applyDeltas } from '../support/replay';

function editReplays(cells: CellSource[], index: number, ops: SourceOp[]): void {
  const before = textView(cells);
  const deltas = sourceEditDeltas(new OffsetMap(cells), index, cells[index]!.source, ops);
  const after = cells.map((cell, i) =>
    i === index ? { ...cell, source: applySourceOps(cell.source, ops) } : cell,
  );
  expect(applyDeltas(before, deltas)).toBe(textView(after));
}

const base: CellSource[] = [
  { id: 'a', cell_type: 'code', source: 'import numpy as np\nx = 1' },
  { id: 'b', cell_type: 'markdown', source: '## Q2' },
  { id: 'c', cell_type: 'code', source: 'print(x)' },
];

describe('sourceEditDeltas', () => {
  it('turns one typed character into one insert delta', () => {
    const deltas = sourceEditDeltas(new OffsetMap(base), 2, 'print(x)', [
      { retain: 6 },
      { insert: 'y' },
    ]);
    expect(deltas).toEqual([
      { range: { start: { line: 6, character: 6 }, end: { line: 6, character: 6 } }, text: 'y' },
    ]);
  });

  it('replays inserts, deletes, replacements and multi-op changes', () => {
    editReplays(base, 0, [{ retain: 3 }, { insert: 'X' }]);
    editReplays(base, 0, [{ retain: 5 }, { delete: 10 }]);
    editReplays(base, 0, [{ retain: 2 }, { delete: 3 }, { insert: 'new\nline' }]);
    editReplays(base, 0, [
      { retain: 1 },
      { insert: 'A' },
      { retain: 4 },
      { delete: 2 },
      { insert: 'B' },
    ]);
    editReplays(base, 1, [{ insert: '\n\n' }]);
  });

  it('keeps an emoji whole when one is replaced by another', () => {
    const cells: CellSource[] = [{ id: 'e', cell_type: 'code', source: '\u{1F600}' }];
    const ops: SourceOp[] = [{ delete: 2 }, { insert: '\u{1F601}' }];
    const deltas = sourceEditDeltas(new OffsetMap(cells), 0, cells[0]!.source, ops);
    expect(deltas[0]!.text).toBe('\u{1F601}');
    editReplays(cells, 0, ops);
  });

  it('emits nothing for a change with no effect', () => {
    expect(sourceEditDeltas(new OffsetMap(base), 0, base[0]!.source, [{ retain: 3 }])).toEqual([]);
  });
});

describe('cellListDeltas', () => {
  function listReplays(before: CellSource[], after: CellSource[]): void {
    const deltas = cellListDeltas(new OffsetMap(before), before, after);
    expect(applyDeltas(textView(before), deltas)).toBe(textView(after));
  }

  it('rewrites only the header line when a cell changes type', () => {
    const after = base.map((cell) =>
      cell.id === 'b' ? { ...cell, cell_type: 'raw' as const } : cell,
    );
    const deltas = cellListDeltas(new OffsetMap(base), base, after);
    expect(deltas).toEqual([
      {
        range: { start: { line: 3, character: 0 }, end: { line: 4, character: 0 } },
        text: '# %% [raw] id=b\n',
      },
    ]);
    listReplays(base, after);
  });

  it('replays adds, deletes and moves', () => {
    const d: CellSource = { id: 'd', cell_type: 'code', source: 'new' };
    listReplays(base, [...base, d]);
    listReplays(base, [d, ...base]);
    listReplays(base, [base[0]!, d, base[1]!, base[2]!]);
    listReplays(base, [base[0]!, base[2]!]);
    listReplays(base, [base[2]!, base[0]!, base[1]!]);
    listReplays(base, []);
    listReplays([], base);
  });

  it('touches only the cells between unchanged neighbours', () => {
    const deltas = cellListDeltas(new OffsetMap(base), base, [base[0]!, base[2]!]);
    expect(deltas).toEqual([
      {
        range: { start: { line: 3, character: 0 }, end: { line: 5, character: 0 } },
        text: '',
      },
    ]);
  });
});

describe('random edits replay exactly', () => {
  // Deterministic generator, so a failure always reproduces.
  let seed = 12345;
  const random = (n: number): number => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed % n;
  };
  const alphabet = ['a', 'b', '\n', ' ', '\u{1F600}', 'é'];
  const text = (max: number): string =>
    Array.from({ length: random(max) }, () => alphabet[random(alphabet.length)]).join('');

  it('reproduces the view after 2000 random source and list edits', () => {
    let cells: CellSource[] = [
      { id: 'c0', cell_type: 'code', source: 'x' },
      { id: 'c1', cell_type: 'markdown', source: '' },
    ];
    let nextId = 2;
    let view = textView(cells);
    for (let step = 0; step < 2000; step++) {
      const map = new OffsetMap(cells);
      if (random(5) > 0 && cells.length > 0) {
        const index = random(cells.length);
        const source = cells[index]!.source;
        // Edit only at code-point boundaries, as an editor would.
        const boundaries = [0];
        for (const ch of source) boundaries.push(boundaries[boundaries.length - 1]! + ch.length);
        const startAt = random(boundaries.length);
        const endAt = Math.min(boundaries.length - 1, startAt + random(3));
        const at = boundaries[startAt]!;
        const remove = boundaries[endAt]! - at;
        const ops: SourceOp[] = [{ retain: at }, { delete: remove }, { insert: text(4) }];
        view = applyDeltas(view, sourceEditDeltas(map, index, source, ops));
        cells = cells.map((cell, i) =>
          i === index ? { ...cell, source: applySourceOps(cell.source, ops) } : cell,
        );
      } else {
        const next = [...cells];
        const action = random(3);
        if (action === 0) {
          next.splice(random(next.length + 1), 0, {
            id: `c${nextId++}`,
            cell_type: 'code',
            source: text(6),
          });
        } else if (action === 1 && next.length > 0) {
          next.splice(random(next.length), 1);
        } else if (next.length > 1) {
          const [moved] = next.splice(random(next.length), 1);
          next.splice(random(next.length + 1), 0, moved!);
        }
        view = applyDeltas(view, cellListDeltas(map, cells, next));
        cells = next;
      }
      expect(view).toBe(textView(cells));
    }
  });
});
