import { describe, expect, it } from 'vitest';
import { relativeToRoot } from '../../../src/recorder/session/assignment-relative-path';
import type { RecordingSession } from '../../../src/recorder/session/recording-session';
import { resolveOwnerRoot, routePath } from '../../../src/recorder/session/session-router';
import { isRecordable } from '../../../src/recorder/wiring/recordability-filter';

describe('relativeToRoot', () => {
  it('strips the root from paths inside it', () => {
    expect(relativeToRoot('data100/hw1', 'data100/hw1/hw1.ipynb')).toBe('hw1.ipynb');
    expect(relativeToRoot('data100/hw1', 'data100/hw1')).toBe('');
  });

  it('treats the empty root as the server root', () => {
    expect(relativeToRoot('', 'hw1.ipynb')).toBe('hw1.ipynb');
  });

  it('returns null outside the root, including look-alike prefixes', () => {
    expect(relativeToRoot('data100/hw1', 'data100/hw10/x.py')).toBeNull();
    expect(relativeToRoot('data100/hw1', 'other.py')).toBeNull();
  });
});

describe('resolveOwnerRoot', () => {
  it('picks the innermost root, as VS Code does', () => {
    const roots = ['', 'course', 'course/hw1'];
    expect(resolveOwnerRoot('course/hw1/a.py', roots)).toBe('course/hw1');
    expect(resolveOwnerRoot('course/notes.md', roots)).toBe('course');
    expect(resolveOwnerRoot('elsewhere.py', roots)).toBe('');
  });

  it('returns null when no root contains the path', () => {
    expect(resolveOwnerRoot('scratch/a.py', ['course/hw1'])).toBeNull();
  });
});

describe('isRecordable', () => {
  it('refuses the recorder’s own artifacts', () => {
    for (const path of [
      '',
      '.provenance',
      '.provenance/session-x.slog',
      '.provenance-manifest',
      'provenance-manifest',
    ]) {
      expect(isRecordable(path)).toBe(false);
    }
  });

  it('accepts ordinary files, including ones that only look similar', () => {
    for (const path of [
      'hw1.ipynb',
      'src/a.py',
      '.provenance-notes.md',
      'sub/.provenance-manifest',
    ]) {
      expect(isRecordable(path)).toBe(true);
    }
  });
});

describe('routePath', () => {
  const session = (root: string) => ({ root }) as RecordingSession;
  const sessions = [session('data100/hw1'), session('data100/hw2')];

  it('routes a path to its session with an assignment-relative path', () => {
    const route = routePath('data100/hw2/q1.py', sessions);
    expect(route?.session.root).toBe('data100/hw2');
    expect(route?.path).toBe('q1.py');
  });

  it('drops paths outside every root, and the recorder’s own files', () => {
    expect(routePath('data100/scratch.py', sessions)).toBeNull();
    expect(routePath('data100/hw1/.provenance/session-x.slog', sessions)).toBeNull();
    expect(routePath('data100/hw1/.provenance-manifest', sessions)).toBeNull();
  });
});
