/**
 * Wraps log-core chainEntry. The only emit path.
 *
 * TODO: not implemented. See docs/design.md.
 */

export interface ActivityEvent {
  type: string;
  timestamp: string;
  sequence: number;
  session_id: string;
  payload: Record<string, unknown>;
}

export type ActivitySink = (
  event: ActivityEvent,
) => Promise<void>;

export class SessionHost {
  private sequence = 0;
  private pending: Promise<void> = Promise.resolve();
  private failed = false;
  private failure: unknown;

  constructor(
    readonly sessionId: string,
    private sink: ActivitySink,
    private clock: () => Date = () => new Date(),
  ) {}

  emit(
    type: string,
    payload: Record<string, unknown>,
  ): void {
    const event: ActivityEvent = structuredClone({
      type,
      timestamp: this.clock().toISOString(),
      sequence: this.sequence++,
      session_id: this.sessionId,
      payload,
    });

    // Send events to the sink in their original order.
    this.pending = this.pending.then(async () => {
      if (this.failed) {
        return;
      }

      try {
        await this.sink(event);
      } catch (error) {
        this.failed = true;
        this.failure = error;
      }
    });
  }

  async flush(): Promise<void> {
    await this.pending;

    if (this.failed) {
      throw this.failure;
    }
  }
}