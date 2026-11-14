/**
 * Routes a server path to the recording session that owns it.
 *
 * Ported from the VS Code recorder's `session/session-router.ts`: when assignment roots are
 * nested, the innermost root owns the file. Paths outside every root, and the recorder's own
 * artifacts, are not recorded.
 */

import { isRecordable } from '../wiring/recordability-filter';
import { relativeToRoot } from './assignment-relative-path';
import type { RecordingSession } from './recording-session';

/** The innermost root containing `path`, or `null`. */
export function resolveOwnerRoot(path: string, roots: readonly string[]): string | null {
  let best: string | null = null;
  for (const root of roots) {
    if (relativeToRoot(root, path) === null) continue;
    if (best === null || root.length > best.length) best = root;
  }
  return best;
}

export interface Route {
  session: RecordingSession;
  /** Path relative to the session's assignment root, as written into the log. */
  path: string;
}

export function routePath(path: string, sessions: readonly RecordingSession[]): Route | null {
  const root = resolveOwnerRoot(
    path,
    sessions.map((s) => s.root),
  );
  if (root === null) return null;
  const session = sessions.find((s) => s.root === root)!;
  const relative = relativeToRoot(root, path)!;
  return isRecordable(relative) ? { session, path: relative } : null;
}
