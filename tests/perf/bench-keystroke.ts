/**
 * Keystroke-path benchmark. Goal (recorder PRD §4.7): doc.change handlers run in < 1 ms p99.
 *
 * Shaped like the VS Code recorder's `test/perf/bench-append.ts`: a plain Vitest `it` that
 * times each call with `performance.now()`, prints mean, p50, p95, p99 and max, and warns
 * when p99 is over budget. It never fails, because timings depend on the machine.
 *
 * Unlike bench-append, which pre-chains its entries and times only `SessionWriter.append`,
 * this times the whole synchronous path one keystroke takes in provjup, exactly as
 * `jupyter-documents.ts` calls it: `sourceChanged` with the shared model's current text (its
 * exactness check included), the delta conversion, `chainEntry` (JCS canonicalization and
 * SHA-256) and `SessionWriter.append`. Flushing to the server is asynchronous and off this
 * path, so the buffer is sized never to flush while timing.
 *
 * Run: npm run bench
 */

import { describe, it } from 'vitest';
import { FixedClock } from '../../src/core/index';
import type { CellSource } from '../../src/notebook/text-view';
import type { AppendResult } from '../../src/recorder/io/server-client';
import { SessionWriter, type Timers } from '../../src/recorder/io/session-writer';
import { createSessionHost } from '../../src/recorder/session/session-host';
import { FileWiring } from '../../src/recorder/wiring/file-editor-wiring';
import { NotebookWiring } from '../../src/recorder/wiring/notebook-wiring';

const KEYSTROKES = 5_000;
const WARMUP = 200;
const BUDGET_MS = 1.0;

const noTimers: Timers = { setInterval: () => 0, clearInterval: () => undefined };
const server = {
  appendLog: (_d: string, _f: string, offset: number, data: string): Promise<AppendResult> =>
    Promise.resolve({ kind: 'ok', size: offset + data.length }),
};

function pipeline() {
  const clock = new FixedClock(0, new Date('2026-11-14T00:00:00.000Z'));
  const writer = new SessionWriter({
    server,
    dir: 'data100/hw1',
    file: 'session-00000000-0000-4000-8000-000000000000.slog',
    clock,
    timers: noTimers,
    // Benchmark the keystroke path, not the flush.
    bufferPolicy: { maxBytes: 1024 * 1024 * 1024, maxIntervalMs: 3_600_000 },
  });
  const host = createSessionHost({
    sessionId: '00000000-0000-4000-8000-000000000000',
    clock,
    onEntry: (entry) => writer.append(entry),
  });
  return { host, writer };
}

function percentile(sorted: readonly number[], p: number): number {
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)] ?? 0;
}

function report(label: string, times: number[]): void {
  times.sort((a, b) => a - b);
  const mean = times.reduce((a, b) => a + b, 0) / times.length;
  const p99 = percentile(times, 99);
  const row = (name: string, ms: number) => `  ${name.padEnd(5)} = ${ms.toFixed(4)} ms`;
  console.log(`\n${label} (${times.length} keystrokes):`);
  console.log(row('mean', mean));
  console.log(row('p50', percentile(times, 50)));
  console.log(row('p95', percentile(times, 95)));
  console.log(row('p99', p99));
  console.log(row('max', times[times.length - 1] ?? 0));
  if (p99 > BUDGET_MS) {
    console.warn(`  WARNING: p99 exceeds the PRD §4.7 budget of ${BUDGET_MS} ms.`);
  } else {
    console.log(`  p99 is within the PRD §4.7 budget (< ${BUDGET_MS} ms). OK.`);
  }
}

/** Times `type(i)` for each keystroke, after an untimed warm-up. */
function measure(type: (i: number) => void): number[] {
  for (let i = 0; i < WARMUP; i++) type(i);
  const times: number[] = [];
  for (let i = 0; i < KEYSTROKES; i++) {
    const start = performance.now();
    type(WARMUP + i);
    times.push(performance.now() - start);
  }
  return times;
}

const char = (i: number): string => (i % 40 === 39 ? '\n' : 'abcdefghij'[i % 10]!);

/** A notebook of `count` code cells, each `cellBytes` long. */
function notebook(count: number, cellBytes: number): CellSource[] {
  const line = 'x = np.arange(10)  # a line of student code\n';
  const source = line.repeat(Math.ceil(cellBytes / line.length)).slice(0, cellBytes);
  return Array.from({ length: count }, (_, i) => ({
    id: `cell-${i}`,
    cell_type: 'code' as const,
    source,
  }));
}

function benchNotebook(label: string, cells: CellSource[]): void {
  const { host } = pipeline();
  const wiring = new NotebookWiring(host);
  wiring.opened('hw1.ipynb', cells);
  // Type at the end of the last cell: the largest offsets in the view.
  const last = cells[cells.length - 1]!;
  let source = last.source;
  report(
    label,
    measure((i) => {
      const ch = char(i);
      const ops = [{ retain: source.length }, { insert: ch }];
      source += ch;
      wiring.sourceChanged('hw1.ipynb', last.id, ops, source);
    }),
  );
}

describe('keystroke path performance (PRD §4.7)', () => {
  it('text file', () => {
    const { host } = pipeline();
    const wiring = new FileWiring(host);
    let text = 'def helper():\n';
    wiring.opened('util.py', text);
    report(
      'Text file',
      measure((i) => {
        const ch = char(i);
        const ops = [{ retain: text.length }, { insert: ch }];
        text += ch;
        wiring.sourceChanged('util.py', ops, text);
      }),
    );
  }, 120_000);

  it('small notebook (5 cells)', () => {
    benchNotebook('Small notebook, 5 cells', notebook(5, 200));
  }, 120_000);

  it('homework-sized notebook (200 cells, about 100 KB)', () => {
    benchNotebook('Homework notebook, 200 cells', notebook(200, 500));
  }, 120_000);

  it('large notebook (200 cells, about 2 MB)', () => {
    benchNotebook('Large notebook, 200 cells, 2 MB', notebook(200, 10_000));
  }, 120_000);
});
