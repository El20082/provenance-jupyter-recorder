/**
 * One recording session per assignment root.
 *
 * The minimal part of the VS Code recorder's `SessionRegistry`: add, look up, list, and end
 * every session in order. Pruning sessions whose folder disappears comes with the file-browser
 * wiring in a later task.
 */

import type { RecordingSession } from './recording-session';

export class SessionRegistry {
  private readonly sessions = new Map<string, RecordingSession>();

  add(session: RecordingSession): void {
    this.sessions.set(session.root, session);
  }

  get(root: string): RecordingSession | undefined {
    return this.sessions.get(root);
  }

  all(): RecordingSession[] {
    return [...this.sessions.values()];
  }

  /** End every session, one after another: log writes are ordered. */
  async endAll(reason: string): Promise<void> {
    for (const session of this.all()) {
      await session.end(reason);
    }
    this.sessions.clear();
  }
}
