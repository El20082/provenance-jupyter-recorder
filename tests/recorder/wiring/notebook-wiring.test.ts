import { describe, expect, it } from 'vitest';
import {
  FixedClock,
  parseEntries,
  serializeEntry,
  sha256Hex,
  validateChain,
} from '../../../src/core/index';
import type { DocChangePayload, HashedEnvelope } from '../../../src/core/index';
import { textView, type CellSource } from '../../../src/notebook/text-view';
import { createSessionHost } from '../../../src/recorder/session/session-host';
import { MAX_INLINE_BYTES, NotebookWiring } from '../../../src/recorder/wiring/notebook-wiring';
import { applyDeltas } from '../../support/replay';

function setup() {
  const clock = new FixedClock(0, new Date('2026-11-13T00:00:00.000Z'));
  const entries: HashedEnvelope[] = [];
  const host = createSessionHost({ sessionId: 's', clock, onEntry: (e) => entries.push(e) });
  return { clock, entries, wiring: new NotebookWiring(host) };
}

const cells: CellSource[] = [
  { id: 'a', cell_type: 'code', source: 'x = 1' },
  { id: 'b', cell_type: 'markdown', source: '## Q2' },
];

const savedJson = (list: CellSource[]): string =>
  JSON.stringify({
    nbformat: 4,
    nbformat_minor: 5,
    metadata: {},
    cells: list.map((c) => ({ ...c, metadata: {}, outputs: [] })),
  });

describe('NotebookWiring', () => {
  it('opens a notebook with the view inlined, its hash and line count', () => {
    const { entries, wiring } = setup();
    expect(wiring.opened('hw.ipynb', cells)).toEqual({ ok: true });
    const view = textView(cells);
    expect(entries[0]!.kind).toBe('doc.open');
    expect(entries[0]!.data).toEqual({
      path: 'hw.ipynb',
      sha256: sha256Hex(view),
      line_count: view.split('\n').length,
      content: view,
    });
  });

  it('marks a view over the inline limit as truncated instead of inlining it', () => {
    const { entries, wiring } = setup();
    wiring.opened('big.ipynb', [
      { id: 'a', cell_type: 'code', source: 'x'.repeat(MAX_INLINE_BYTES) },
    ]);
    const data = entries[0]!.data as Record<string, unknown>;
    expect(data['truncated']).toBe(true);
    expect('content' in data).toBe(false);
  });

  it('does not record a notebook without cell ids, and does not throw', () => {
    const { entries, wiring } = setup();
    expect(wiring.opened('old.ipynb', [{ id: '', cell_type: 'code', source: '' }])).toEqual({
      ok: false,
      reason: 'missing_cell_id',
    });
    expect(entries).toHaveLength(0);
  });

  it('records one doc.change per keystroke, in view coordinates', () => {
    const { entries, wiring } = setup();
    wiring.opened('hw.ipynb', cells);
    wiring.sourceChanged('hw.ipynb', 'a', [{ retain: 5 }, { insert: '0' }]);
    expect(entries[1]!.kind).toBe('doc.change');
    expect(entries[1]!.data).toEqual({
      path: 'hw.ipynb',
      deltas: [
        { range: { start: { line: 1, character: 5 }, end: { line: 1, character: 5 } }, text: '0' },
      ],
      source: 'typed',
    });
  });

  it('records the hash of the saved view on save', () => {
    const { entries, wiring } = setup();
    wiring.opened('hw.ipynb', cells);
    wiring.saved('hw.ipynb', savedJson(cells));
    expect(entries[1]!.data).toEqual({ path: 'hw.ipynb', sha256: sha256Hex(textView(cells)) });
  });

  it('ignores events for notebooks that are not open', () => {
    const { entries, wiring } = setup();
    wiring.sourceChanged('other.ipynb', 'a', [{ insert: 'x' }]);
    wiring.cellsChanged('other.ipynb', cells);
    wiring.saved('other.ipynb', savedJson(cells));
    wiring.closed('other.ipynb');
    expect(entries).toHaveLength(0);
  });

  it('emits only doc.* kinds that log-core defines', () => {
    const { entries, wiring } = setup();
    wiring.opened('hw.ipynb', cells);
    wiring.sourceChanged('hw.ipynb', 'b', [{ retain: 2 }, { delete: 1 }]);
    wiring.cellsChanged('hw.ipynb', [cells[1]!, cells[0]!]);
    wiring.saved('hw.ipynb', savedJson(cells));
    wiring.closed('hw.ipynb');
    expect(entries.map((e) => e.kind)).toEqual([
      'doc.open',
      'doc.change',
      'doc.change',
      'doc.save',
      'doc.close',
    ]);
  });
});

describe('NotebookWiring output is a valid Provenance log', () => {
  it('parses with log-core, chain-validates, and replays to the final view', () => {
    const { clock, entries, wiring } = setup();
    wiring.opened('hw.ipynb', cells);
    let current = cells.map((c) => ({ ...c }));
    for (const ch of 'y = 2\n') {
      const at = current[0]!.source.length;
      wiring.sourceChanged('hw.ipynb', 'a', [{ retain: at }, { insert: ch }]);
      current[0]!.source += ch;
      clock.advance(120);
    }
    current = [...current, { id: 'c', cell_type: 'code', source: 'print(x)' }];
    wiring.cellsChanged('hw.ipynb', current);
    wiring.saved('hw.ipynb', savedJson(current));
    wiring.closed('hw.ipynb');

    const ndjson = entries.map((e) => serializeEntry(e)).join('');
    const parsed = parseEntries(ndjson);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(validateChain(parsed.value).ok).toBe(true);

    let view = (entries[0]!.data as { content: string }).content;
    for (const entry of parsed.value) {
      if (entry.kind === 'doc.change')
        view = applyDeltas(view, (entry.data as DocChangePayload).deltas);
    }
    expect(view).toBe(textView(current));
    const save = parsed.value.find((e) => e.kind === 'doc.save')!;
    expect((save.data as { sha256: string }).sha256).toBe(sha256Hex(view));
  });
});

describe('NotebookWiring resynchronization', () => {
  it('skips a change it already has, and replaces a cell whose change does not line up', () => {
    const { entries, wiring } = setup();
    wiring.opened('hw.ipynb', cells);
    wiring.sourceChanged('hw.ipynb', 'a', [{ retain: 5 }, { insert: '0' }], 'x = 1');
    expect(entries).toHaveLength(1);
    wiring.sourceChanged('hw.ipynb', 'a', [{ insert: 'wrong' }], 'x = 10');
    wiring.sourceChanged('hw.ipynb', 'b', null, '## Q3');
    let view = (entries[0]!.data as { content: string }).content;
    for (const e of entries.slice(1)) view = applyDeltas(view, (e.data as DocChangePayload).deltas);
    expect(view).toBe(
      textView([
        { id: 'a', cell_type: 'code', source: 'x = 10' },
        { id: 'b', cell_type: 'markdown', source: '## Q3' },
      ]),
    );
  });
});
