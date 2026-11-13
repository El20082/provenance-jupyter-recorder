/**
 * SessionHost — owns the running session's chain state.
 * Tracks seq, prevHash, and tStart; emits chained log entries synchronously.
 * CLAUDE.md: "Every log entry goes through `session-host.ts`."
 *
 * Ported from the VS Code recorder's `packages/recorder/src/session/session-host.ts`
 * without behavioural change. Keep the two in step.
 */

import {
  DEFAULT_CAPTURE_POLICY,
  GENESIS_PREV_HASH,
  chainEntry,
  isEventKindCaptured,
} from '../../core/index';
import type {
  CapturePolicy,
  Clock,
  EventKind,
  EventPayload,
  HashedEnvelope,
} from '../../core/index';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SessionHost {
  /**
   * Emit a new log entry, chain it, and call the onEntry sink. Returns the chained
   * entry, or `null` if the capture policy suppresses this event kind.
   *
   * A suppressed event is dropped BEFORE chaining, so it consumes no `seq` and the
   * chain stays contiguous.
   */
  emit<K extends EventKind>(kind: K, data: EventPayload<K>): HashedEnvelope<K> | null;
  /** The session UUID for this session. */
  readonly sessionId: string;
  /** The current sequence number (increments after each emit). */
  readonly seq: number;
  /** The monotonic clock value at session start (performance.now() units). */
  readonly tStartMs: number;
}

export type SessionHostDeps = {
  sessionId: string;
  clock: Clock;
  /** Sink for emitted entries. Task 4 wires this to the buffered writer. */
  onEntry: (entry: HashedEnvelope) => void;
  /**
   * The course's effective capture policy, resolved from the VERIFIED manifest.
   * Defaults to {@link DEFAULT_CAPTURE_POLICY}, which records everything.
   *
   * Resolve it once, here. `emit` reads plain booleans off this object; it must never
   * re-verify or re-parse anything, because `doc.change` fires per keystroke.
   */
  capturePolicy?: CapturePolicy;
};

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Create a SessionHost.
 *
 * The host is synchronous: emit() builds the envelope, chains it (computing the hash),
 * calls onEntry, and returns the HashedEnvelope. No awaits. Buffering and ordered
 * writes belong to the session writer, not here.
 *
 * seq starts at 0. prevHash starts at GENESIS_PREV_HASH.
 * tStart is captured from clock.now() at creation time.
 */
export function createSessionHost(deps: SessionHostDeps): SessionHost {
  const { sessionId, clock, onEntry, capturePolicy = DEFAULT_CAPTURE_POLICY } = deps;

  let currentSeq = 0;
  let prevHash = GENESIS_PREV_HASH;
  const tStart = clock.now();

  const host: SessionHost = {
    get sessionId(): string {
      return sessionId;
    },

    get seq(): number {
      return currentSeq;
    },

    get tStartMs(): number {
      return tStart;
    },

    emit<K extends EventKind>(kind: K, data: EventPayload<K>): HashedEnvelope<K> | null {
      // The single choke point for the capture policy. Suppression happens BEFORE
      // chainEntry, so a dropped event consumes no seq; dropping after chaining would
      // leave a hole that validation check 4 (seq_gaps) reads as a deleted entry.
      if (!isEventKindCaptured(kind, capturePolicy)) {
        return null;
      }

      const seq = currentSeq;
      // t: ms elapsed since session start (monotonic). Non-negative; floor at 0.
      const t = Math.max(0, Math.round(clock.now() - tStart));
      const wall = clock.wall();

      const entry = chainEntry(prevHash, { seq, t, wall, kind, data });

      // Advance state before calling onEntry to maintain consistency even if onEntry throws.
      currentSeq = seq + 1;
      prevHash = entry.hash;

      onEntry(entry);
      return entry;
    },
  };

  return host;
}
