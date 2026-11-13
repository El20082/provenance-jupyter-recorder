import { describe, expect, it } from 'vitest';
import { FixedClock, parseEntries, validateChain } from '../../../src/core/index';
import type { HashedEnvelope } from '../../../src/core/index';
import {
  SessionWriter,
  type Timers,
  type WriterProblem,
} from '../../../src/recorder/io/session-writer';
import { createSessionHost } from '../../../src/recorder/session/session-host';
import { FakeServer } from '../../support/fake-server';

const FILE = 'session-00000000-0000-4000-8000-000000000001.slog';
const PATH = `hw1/.provenance/${FILE}`;

function manualTimers(): Timers & { tick(): void; cleared: boolean } {
  let fn: (() => void) | undefined;
  return {
    cleared: false,
    setInterval(callback) {
      fn = callback;
      return 1;
    },
    clearInterval() {
      this.cleared = true;
    },
    tick() {
      fn?.();
    },
  };
}

function setup(maxBytes?: number) {
  const clock = new FixedClock(0, new Date('2026-11-13T00:00:00.000Z'));
  const server = new FakeServer();
  const timers = manualTimers();
  const problems: WriterProblem[] = [];
  const writer = new SessionWriter({
    server,
    dir: 'hw1',
    file: FILE,
    clock,
    timers,
    onProblem: (p) => problems.push(p),
    ...(maxBytes !== undefined ? { bufferPolicy: { maxBytes } } : {}),
  });
  const entries: HashedEnvelope[] = [];
  const host = createSessionHost({
    sessionId: 's',
    clock,
    onEntry: (e) => {
      entries.push(e);
      writer.append(e);
    },
  });
  return { clock, server, timers, problems, writer, host, entries };
}

function parsed(server: FakeServer): readonly HashedEnvelope[] {
  const result = parseEntries(server.text(PATH));
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}

describe('SessionWriter', () => {
  it('writes chained entries in order on flush', async () => {
    const { server, writer, host } = setup();
    for (const reason of ['a', 'b', 'c']) host.emit('session.end', { reason });
    await writer.flush();
    const entries = parsed(server);
    expect(entries.map((e) => (e.data as { reason: string }).reason)).toEqual(['a', 'b', 'c']);
    expect(validateChain(entries).ok).toBe(true);
    expect(writer.writtenBytes).toBe(new TextEncoder().encode(server.text(PATH)).length);
  });

  it('buffers until the size threshold, then flushes on its own', async () => {
    const { server, writer, host } = setup(400);
    host.emit('session.end', { reason: 'small' });
    await Promise.resolve();
    expect(server.text(PATH)).toBe('');
    host.emit('session.end', { reason: 'x'.repeat(400) });
    await writer.flush();
    expect(parsed(server)).toHaveLength(2);
  });

  it('flushes on the interval timer', async () => {
    const { server, timers, host, writer } = setup();
    host.emit('session.end', { reason: 'a' });
    timers.tick();
    await writer.flush();
    expect(parsed(server)).toHaveLength(1);
  });

  it('keeps lines after a failed write and writes them, in order, on the next flush', async () => {
    const { server, writer, host, problems } = setup();
    host.emit('session.end', { reason: 'a' });
    server.failNext = 1;
    await writer.flush();
    expect(server.text(PATH)).toBe('');
    expect(problems).toEqual([{ kind: 'write_failed', message: 'network down' }]);
    host.emit('session.end', { reason: 'b' });
    await writer.flush();
    const entries = parsed(server);
    expect(entries.map((e) => (e.data as { reason: string }).reason)).toEqual(['a', 'b']);
    expect(validateChain(entries).ok).toBe(true);
  });

  it('does not duplicate lines whose write landed but whose reply was lost', async () => {
    const { server, writer, host } = setup();
    host.emit('session.end', { reason: 'a' });
    server.loseReplies = 1;
    await writer.flush();
    await writer.flush();
    expect(parsed(server)).toHaveLength(1);
    host.emit('session.end', { reason: 'b' });
    await writer.flush();
    expect(parsed(server)).toHaveLength(2);
  });

  it('reports when something else wrote to the file', async () => {
    const { server, writer, host, problems } = setup();
    server.foreignWrite(PATH, 'x\n');
    host.emit('session.end', { reason: 'a' });
    await writer.flush();
    expect(problems).toEqual([{ kind: 'offset_lost', expected: 0, actual: 2 }]);
  });

  it('flushes what is left and stops the timer on dispose; dispose is idempotent', async () => {
    const { server, writer, host, timers } = setup();
    host.emit('session.end', { reason: 'a' });
    await writer.dispose();
    await writer.dispose();
    expect(parsed(server)).toHaveLength(1);
    expect(timers.cleared).toBe(true);
  });

  it('refuses appends after dispose', async () => {
    const { writer, host } = setup();
    await writer.dispose();
    expect(() => host.emit('session.end', { reason: 'late' })).toThrow(/after dispose/);
  });
});
