/**
 * Builds the `session.start` payload.
 *
 * Ported from the VS Code recorder's `session/recorder-context.ts`. Differences:
 * - The host block: log-core's `HostInfo.editor` does not yet accept `'jupyterlab'`
 *   (blocker B7), so `host` is omitted and the older `vscode` block is filled with
 *   JupyterLab's values instead, as provjet and provnvim do. Switch to `host` once the
 *   monorepo lands the approved value.
 * - `machine_id` hashes the server's hostname and user, which a browser cannot read itself.
 * - No `identity`, `git_capture` or `witness_capture` yet: they arrive in Tasks 6 to 8.
 */

import { buildFileScope, isExactEntry, sha256Hex } from '../../core/index';
import type { Manifest, SessionFileScope, SessionStartPayload } from '../../core/index';
import type { HostFacts } from '../io/server-client';

export const EXTENSION_ID = 'provjup';

/** Matches the VS Code recorder's cap on how many exact paths `file_scope` lists. */
export const FILE_SCOPE_MAX_ENTRIES = 4096;

/** The files this session watches, as reported in `session.start.file_scope`. */
export function resolveFileScope(
  filesUnderReview: readonly string[],
): SessionFileScope | undefined {
  const exact = filesUnderReview.filter(isExactEntry);
  const hasRules = exact.length !== filesUnderReview.length;
  const complete = !hasRules && exact.length <= FILE_SCOPE_MAX_ENTRIES;
  const watched = exact.slice(0, FILE_SCOPE_MAX_ENTRIES);
  return buildFileScope(watched, complete);
}

/** sha256 of hostname, user and session id, as in VS Code. Never reveals either directly. */
export function computeMachineId(facts: HostFacts, sessionId: string): string {
  return sha256Hex(`${facts.hostname}:${facts.username}:${sessionId}`);
}

export function buildRecorderContext(args: {
  manifest: Manifest;
  sessionId: string;
  prevSessionId: string | null;
  sessionPubkeyHex: string;
  host: HostFacts;
  recorderVersion: string;
  jupyterlabVersion: string;
}): SessionStartPayload {
  const { manifest, sessionId, host } = args;
  const fileScope = resolveFileScope(manifest.files_under_review);
  return {
    format_version: '1.0',
    session_id: sessionId,
    prev_session_id: args.prevSessionId,
    assignment: { id: manifest.assignment_id, semester: manifest.semester },
    manifest_sig: manifest.sig,
    machine_id: computeMachineId(host, sessionId),
    manifest,
    ...(fileScope !== undefined ? { file_scope: fileScope } : {}),
    vscode: { version: args.jupyterlabVersion, commit: '', platform: host.platform },
    recorder: { version: args.recorderVersion, extension_id: EXTENSION_ID },
    session_pubkey: args.sessionPubkeyHex,
  };
}
