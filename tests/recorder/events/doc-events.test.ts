import { describe, expect, it } from 'vitest';
import { sha256Hex } from '../../../src/core/index';
import { applySourceOps, type SourceOp } from '../../../src/notebook/cell-delta';
import {
  MAX_INLINE_BYTES,
  docOpenPayload,
  docSavePayload,
  normalizeDelta,
  textEditDeltas,
} from '../../../src/recorder/events/doc-events';
import { applyDeltas } from '../../support/replay';

describe('docOpenPayload', () => {
  it('inlines small files with their hash and line count', () => {
    expect(docOpenPayload('a.py', 'x = 1\ny = 2\n')).toEqual({
      path: 'a.py',
      sha256: sha256Hex('x = 1\ny = 2\n'),
      line_count: 3,
      content: 'x = 1\ny = 2\n',
    });
  });

  it('marks files over the inline limit as truncated', () => {
    const payload = docOpenPayload('big.csv', 'x'.repeat(MAX_INLINE_BYTES + 1));
    expect(payload.truncated).toBe(true);
    expect(payload.content).toBeUndefined();
  });
});

describe('docSavePayload', () => {
  it('hashes the saved text', () => {
    expect(docSavePayload('a.py', 'saved')).toEqual({ path: 'a.py', sha256: sha256Hex('saved') });
  });
});

describe('textEditDeltas', () => {
  const replays = (text: string, ops: SourceOp[]) =>
    expect(applyDeltas(text, textEditDeltas(text, ops))).toBe(applySourceOps(text, ops));

  it('turns a typed character into one insert delta', () => {
    expect(textEditDeltas('ab\ncd', [{ retain: 4 }, { insert: 'X' }])).toEqual([
      { range: { start: { line: 1, character: 1 }, end: { line: 1, character: 1 } }, text: 'X' },
    ]);
  });

  it('replays inserts, deletes, replacements and multi-op edits', () => {
    replays('one\ntwo\nthree', [{ retain: 2 }, { delete: 5 }, { insert: 'NEW\n' }]);
    replays('one\ntwo', [{ insert: 'A' }, { retain: 4 }, { delete: 1 }, { insert: 'B' }]);
    replays('\u{1F600}x', [{ delete: 2 }, { insert: '\u{1F601}' }]);
    replays('', [{ insert: 'first line\nsecond' }]);
  });
});

describe('normalizeDelta', () => {
  it('reads Quill-style delta items', () => {
    expect(normalizeDelta([{ retain: 3 }, { insert: 'x' }, { delete: 2 }])).toEqual([
      { retain: 3 },
      { insert: 'x' },
      { delete: 2 },
    ]);
  });

  it('returns null for anything else, so the caller resynchronizes', () => {
    expect(normalizeDelta('x')).toBeNull();
    expect(normalizeDelta([{ insert: [1] }])).toBeNull();
    expect(normalizeDelta([{}])).toBeNull();
  });
});
