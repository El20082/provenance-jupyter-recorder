import { describe, expect, it } from 'vitest';
import { FixedClock, sha256Hex } from '../../../src/core/index';
import type { DocChangePayload, HashedEnvelope } from '../../../src/core/index';
import { createSessionHost } from '../../../src/recorder/session/session-host';
import { FileWiring } from '../../../src/recorder/wiring/file-editor-wiring';
import { applyDeltas } from '../../support/replay';

function setup() {
  const entries: HashedEnvelope[] = [];
  const host = createSessionHost({
    sessionId: 's',
    clock: new FixedClock(),
    onEntry: (e) => entries.push(e),
  });
  return { entries, wiring: new FileWiring(host) };
}

function replay(entries: HashedEnvelope[]): string {
  let text = (entries[0]!.data as { content: string }).content;
  for (const e of entries) {
    if (e.kind === 'doc.change') text = applyDeltas(text, (e.data as DocChangePayload).deltas);
  }
  return text;
}

describe('FileWiring', () => {
  it('records open, each edit, save and close, and the edits replay exactly', () => {
    const { entries, wiring } = setup();
    wiring.opened('a.py', 'x = 1\n');
    wiring.sourceChanged('a.py', [{ retain: 6 }, { insert: 'y' }], 'x = 1\ny');
    wiring.sourceChanged('a.py', [{ retain: 7 }, { insert: ' = 2' }], 'x = 1\ny = 2');
    wiring.saved('a.py', 'x = 1\ny = 2');
    wiring.closed('a.py');
    expect(entries.map((e) => e.kind)).toEqual([
      'doc.open',
      'doc.change',
      'doc.change',
      'doc.save',
      'doc.close',
    ]);
    expect(replay(entries)).toBe('x = 1\ny = 2');
    expect(entries[3]!.data).toEqual({ path: 'a.py', sha256: sha256Hex('x = 1\ny = 2') });
  });

  it('still records a save it cannot read back, with the hash of the text it holds', () => {
    const { entries, wiring } = setup();
    wiring.opened('a.py', 'x = 1');
    wiring.saved('a.py', null);
    expect(entries.map((e) => e.kind)).toEqual(['doc.open', 'doc.save']);
    expect(entries[1]!.data).toEqual({ path: 'a.py', sha256: sha256Hex('x = 1') });
  });

  it('skips a change it already has, and resynchronizes one that does not line up', () => {
    const { entries, wiring } = setup();
    wiring.opened('a.py', 'abc');
    wiring.sourceChanged('a.py', [{ retain: 3 }, { insert: 'd' }], 'abc');
    expect(entries).toHaveLength(1);
    wiring.sourceChanged('a.py', [{ insert: 'Z' }], 'totally different');
    wiring.sourceChanged('a.py', null, 'unreadable delta, whole text');
    expect(replay(entries)).toBe('unreadable delta, whole text');
  });

  it('ignores files that are not open', () => {
    const { entries, wiring } = setup();
    wiring.sourceChanged('b.py', [{ insert: 'x' }], 'x');
    wiring.saved('b.py', 'x');
    wiring.closed('b.py');
    expect(entries).toEqual([]);
  });
});
