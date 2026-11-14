import { describe, expect, it } from 'vitest';
import {
  KEYSTROKE_MEASURE,
  keystrokeTimer,
  timingRequested,
  untimed,
  type PerformanceLike,
} from '../../../src/recorder/perf/keystroke-timing';

function fakePerformance() {
  let now = 100;
  const measures: { name: string; start: number; end: number }[] = [];
  const perf: PerformanceLike = {
    now: () => (now += 0.25),
    measure: (name, { start, end }) => measures.push({ name, start, end }),
  };
  return { perf, measures };
}

describe('keystrokeTimer', () => {
  it('runs the handler untimed when timing is off', () => {
    const { perf, measures } = fakePerformance();
    const time = keystrokeTimer(false, perf);
    let ran = 0;
    time(() => ran++);
    expect(ran).toBe(1);
    expect(measures).toEqual([]);
    expect(time).toBe(untimed);
  });

  it('records one measure per handler run when timing is on', () => {
    const { perf, measures } = fakePerformance();
    const time = keystrokeTimer(true, perf);
    let ran = 0;
    time(() => ran++);
    time(() => ran++);
    expect(ran).toBe(2);
    expect(measures).toEqual([
      { name: KEYSTROKE_MEASURE, start: 100.25, end: 100.5 },
      { name: KEYSTROKE_MEASURE, start: 100.75, end: 101 },
    ]);
  });

  it('still records the measure, and rethrows, when the handler throws', () => {
    const { perf, measures } = fakePerformance();
    const time = keystrokeTimer(true, perf);
    expect(() =>
      time(() => {
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(measures).toHaveLength(1);
  });
});

describe('timingRequested', () => {
  it('is true only when the page set the flag to true', () => {
    expect(timingRequested({ __provjupTimeKeystrokes: true })).toBe(true);
    expect(timingRequested({ __provjupTimeKeystrokes: 'true' })).toBe(false);
    expect(timingRequested({})).toBe(false);
    expect(timingRequested(null)).toBe(false);
    expect(timingRequested(undefined)).toBe(false);
  });
});
