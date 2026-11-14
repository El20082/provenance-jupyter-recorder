/**
 * One session's lifecycle: from session.start to session.end.
 *
 * Follows VS Code's `startSession` (session-registry.ts) steps 3a to 6, in the same order:
 * capture policy, session keypair, recorder context, writer, host, then session.start.
 * Later tasks add the steps VS Code takes after these: identity (Task 8), chain recovery,
 * `.slog.meta` and the rolling seal (Task 7), and the signal wiring (Tasks 5 and 6).
 *
 * The session private key stays in memory only. Persisting it, encrypted, is `.slog.meta`'s
 * job in Task 7.
 */

import { generateSessionKeypair } from '../../core/index';
import type { Clock, Manifest, SessionKeypair } from '../../core/index';
import { resolveVerifiedCapturePolicy } from '../activation/manifest-loader';
import type { HostFacts, ProvjupServer } from '../io/server-client';
import { SessionWriter, type Timers, type WriterProblem } from '../io/session-writer';
import { FileWiring } from '../wiring/file-editor-wiring';
import { NotebookWiring } from '../wiring/notebook-wiring';
import { buildRecorderContext } from './recorder-context';
import { createSessionHost, type SessionHost } from './session-host';

export interface StartSessionDeps {
  server: Pick<ProvjupServer, 'appendLog'>;
  /** Assignment root, relative to the server root. */
  root: string;
  manifest: Manifest;
  clock: Clock;
  host: HostFacts;
  recorderVersion: string;
  jupyterlabVersion: string;
  newSessionId?: () => string;
  generateKeypair?: () => Promise<SessionKeypair>;
  timers?: Timers;
  onProblem?: (problem: WriterProblem) => void;
}

export interface RecordingSession {
  readonly root: string;
  readonly sessionId: string;
  readonly sessionPubkeyHex: string;
  readonly host: SessionHost;
  readonly writer: SessionWriter;
  /** Notebook edits for files in this assignment, recorded as the text view. */
  readonly notebooks: NotebookWiring;
  /** Plain text file edits for files in this assignment. */
  readonly files: FileWiring;
  /** Emit session.end and write everything still buffered. Idempotent. */
  end(reason: string): Promise<void>;
}

export function slogFileName(sessionId: string): string {
  return `session-${sessionId}.slog`;
}

export async function startRecordingSession(deps: StartSessionDeps): Promise<RecordingSession> {
  const capturePolicy = resolveVerifiedCapturePolicy(deps.manifest);
  const keypair = await (deps.generateKeypair ?? generateSessionKeypair)();
  const sessionId = (deps.newSessionId ?? (() => crypto.randomUUID()))();

  const context = buildRecorderContext({
    manifest: deps.manifest,
    sessionId,
    prevSessionId: null,
    sessionPubkeyHex: keypair.publicKeyHex,
    host: deps.host,
    recorderVersion: deps.recorderVersion,
    jupyterlabVersion: deps.jupyterlabVersion,
  });

  const writer = new SessionWriter({
    server: deps.server,
    dir: deps.root,
    file: slogFileName(sessionId),
    clock: deps.clock,
    ...(deps.timers !== undefined ? { timers: deps.timers } : {}),
    ...(deps.onProblem !== undefined ? { onProblem: deps.onProblem } : {}),
  });

  const host = createSessionHost({
    sessionId,
    clock: deps.clock,
    capturePolicy,
    onEntry: (entry) => writer.append(entry),
  });

  host.emit('session.start', context);
  // Write session.start now, so the log exists from the moment recording begins.
  await writer.flush();

  let ended = false;
  // Document events that arrive after the session ended (a late signal while the page
  // closes) are dropped instead of reaching a disposed writer.
  const emitWhileOpen: SessionHost['emit'] = (kind, data) => (ended ? null : host.emit(kind, data));
  const notebooks = new NotebookWiring({ emit: emitWhileOpen });
  const files = new FileWiring({ emit: emitWhileOpen });

  return {
    root: deps.root,
    sessionId,
    sessionPubkeyHex: keypair.publicKeyHex,
    host,
    writer,
    notebooks,
    files,
    async end(reason: string): Promise<void> {
      if (ended) return;
      ended = true;
      host.emit('session.end', { reason });
      await writer.dispose();
    },
  };
}
