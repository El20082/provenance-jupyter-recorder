/**
 * SessionWriter — buffered, ordered appends of chained entries to a session's `.slog`,
 * through the server extension.
 *
 * Ported from the VS Code recorder's `io/session-writer.ts`:
 * - append() is synchronous, so signal handlers never wait on I/O;
 * - flushes follow log-core's buffer policy: every 1 s or 256 KB, whichever comes first;
 * - flushes run one at a time on a chain, so writes land in order.
 *
 * One deliberate difference. VS Code DROPS buffered lines when a write fails, because
 * retrying a file write could duplicate them. Here every append carries the byte offset the
 * file should be at, and the server refuses any other offset, so a retry cannot duplicate.
 * Failed lines are therefore kept and retried on the next flush, and a retry that finds its
 * bytes already written counts them as written. Losing keystrokes silently is worse than a
 * late write.
 */

import { DEFAULT_BUFFER_POLICY, serializeEntry, shouldFlush } from '../../core/index';
import type { BufferPolicyConfig, Clock, HashedEnvelope } from '../../core/index';
import type { ProvjupServer } from './server-client';

export interface Timers {
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

const browserTimers: Timers = {
  setInterval: (fn, ms) => globalThis.setInterval(fn, ms),
  clearInterval: (handle) => globalThis.clearInterval(handle as number),
};

export type WriterProblem =
  | { kind: 'write_failed'; message: string }
  /** The file is not where this writer left it; something else wrote to it. */
  | { kind: 'offset_lost'; expected: number; actual: number };

export interface SessionWriterOptions {
  server: Pick<ProvjupServer, 'appendLog'>;
  /** Assignment folder, relative to the server root. */
  dir: string;
  /** `session-<uuid>.slog`. */
  file: string;
  clock: Clock;
  bufferPolicy?: Partial<BufferPolicyConfig>;
  onProblem?: (problem: WriterProblem) => void;
  timers?: Timers;
}

const encoder = new TextEncoder();

export class SessionWriter {
  private buffer: string[] = [];
  private bufferedBytes = 0;
  private offset = 0;
  private lastFlushAtMs: number;
  private disposed = false;
  private flushChain: Promise<void> = Promise.resolve();
  private readonly timer: unknown;
  private readonly timers: Timers;

  constructor(private readonly options: SessionWriterOptions) {
    this.timers = options.timers ?? browserTimers;
    this.lastFlushAtMs = options.clock.now();
    const interval = options.bufferPolicy?.maxIntervalMs ?? DEFAULT_BUFFER_POLICY.maxIntervalMs;
    this.timer = this.timers.setInterval(() => {
      if (!this.disposed) void this.flush();
    }, interval);
  }

  /** Bytes known to be on disk. */
  get writtenBytes(): number {
    return this.offset;
  }

  append(entry: HashedEnvelope): void {
    if (this.disposed) throw new Error('[SessionWriter] append() called after dispose()');
    const line = serializeEntry(entry);
    this.buffer.push(line);
    this.bufferedBytes += encoder.encode(line).length;
    const due = shouldFlush(
      {
        bufferedBytes: this.bufferedBytes,
        lastFlushAtMs: this.lastFlushAtMs,
        nowMs: this.options.clock.now(),
      },
      this.options.bufferPolicy,
    );
    // Fire-and-forget: append() must not block the calling handler.
    if (due) void this.flush();
  }

  flush(): Promise<void> {
    this.flushChain = this.flushChain.then(() => this.doFlush());
    return this.flushChain;
  }

  private async doFlush(): Promise<void> {
    if (this.buffer.length === 0) return;
    const lines = this.buffer;
    const data = lines.join('');
    const bytes = encoder.encode(data).length;
    this.buffer = [];
    this.bufferedBytes = 0;

    const { server, dir, file, onProblem } = this.options;
    const result = await server.appendLog(dir, file, this.offset, data);
    if (result.kind === 'ok') {
      this.offset = result.size;
      this.lastFlushAtMs = this.options.clock.now();
    } else if (result.kind === 'offset_mismatch' && result.size === this.offset + bytes) {
      // An earlier attempt with these exact bytes landed but its reply was lost.
      this.offset = result.size;
      this.lastFlushAtMs = this.options.clock.now();
    } else if (result.kind === 'offset_mismatch') {
      onProblem?.({ kind: 'offset_lost', expected: this.offset, actual: result.size });
      this.offset = result.size;
    } else {
      // Keep the lines, ahead of anything appended meanwhile, and retry on the next flush.
      this.buffer = [...lines, ...this.buffer];
      this.bufferedBytes += bytes;
      onProblem?.({ kind: 'write_failed', message: result.message });
    }
  }

  /** Stop the timer and write everything still buffered. Idempotent. */
  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.timers.clearInterval(this.timer);
    await this.flush();
  }
}
