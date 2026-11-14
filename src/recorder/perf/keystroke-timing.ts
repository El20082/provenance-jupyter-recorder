/**
 * Optional timing of each keystroke handler, for the real-browser check
 * (`scripts/browser-keystroke-check.mjs`), which compares it with the recorder PRD §4.7 budget
 * of 1 ms p99.
 *
 * Off unless the page sets `globalThis.__provjupTimeKeystrokes = true` before the extension
 * loads; the check does that through the DevTools Protocol. Students never set it, and while
 * it is off a keystroke costs nothing extra. When on, each handler run is recorded as a User
 * Timing measure named `provjup:keystroke`, which the check reads back.
 */

export const KEYSTROKE_MEASURE = 'provjup:keystroke';

/** The part of `performance` this needs, so tests can inject a clock. */
export interface PerformanceLike {
  now(): number;
  measure(name: string, options: { start: number; end: number }): unknown;
}

/** Runs a keystroke handler, timing it when timing is on. */
export type TimeKeystroke = (handler: () => void) => void;

export const untimed: TimeKeystroke = (handler) => handler();

export function keystrokeTimer(enabled: boolean, perf: PerformanceLike): TimeKeystroke {
  if (!enabled) return untimed;
  return (handler) => {
    const start = perf.now();
    try {
      handler();
    } finally {
      perf.measure(KEYSTROKE_MEASURE, { start, end: perf.now() });
    }
  };
}

/** Whether the page asked for keystroke timing. */
export function timingRequested(scope: unknown): boolean {
  return (
    typeof scope === 'object' &&
    scope !== null &&
    (scope as { __provjupTimeKeystrokes?: unknown }).__provjupTimeKeystrokes === true
  );
}
