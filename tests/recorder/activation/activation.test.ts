import { describe, expect, it } from 'vitest';
import { FixedClock, parseEntries, validateChain } from '../../../src/core/index';
import type { SessionStartPayload } from '../../../src/core/index';
import { activate, UNKNOWN_HOST } from '../../../src/recorder/activation/activation';
import type { Timers } from '../../../src/recorder/io/session-writer';
import { computeMachineId } from '../../../src/recorder/session/recorder-context';
import { FakeServer } from '../../support/fake-server';
import { signedManifest, testKey } from '../../support/manifests';

const noTimers: Timers = { setInterval: () => 0, clearInterval: () => undefined };

async function scenario() {
  const root = await testKey();
  const server = new FakeServer();
  server.manifests = [
    {
      dir: 'data100/hw1',
      name: '.provenance-manifest',
      text: JSON.stringify(await signedManifest({ root, assignmentId: 'hw1' })),
    },
    {
      dir: 'data100/hw2',
      name: '.provenance-manifest',
      text: JSON.stringify({ ...(await signedManifest({ root })), assignment_id: 'tampered' }),
    },
  ];
  const run = () =>
    activate({
      server,
      clock: new FixedClock(0, new Date('2026-11-13T00:00:00.000Z')),
      recorderVersion: '0.0.0',
      jupyterlabVersion: '4.5.0',
      rootPubkeyHex: root.publicKeyHex,
      timers: noTimers,
    });
  return { server, run };
}

describe('activate', () => {
  it('records verified folders only, and writes nothing for the others', async () => {
    const { server, run } = await scenario();
    const outcome = await run();
    expect(outcome.registry.all().map((s) => s.root)).toEqual(['data100/hw1']);
    expect(outcome.skipped.map((s) => [s.root, s.error.kind])).toEqual([
      ['data100/hw2', 'manifest_chain_invalid'],
    ]);
    const written = [...server.files.keys()];
    expect(written).toHaveLength(1);
    expect(written[0]).toMatch(/^data100\/hw1\/\.provenance\/session-[0-9a-f-]+\.slog$/);

    const parsed = parseEntries(server.text(written[0]!));
    if (!parsed.ok) throw new Error('log did not parse');
    expect(validateChain(parsed.value).ok).toBe(true);
    expect((parsed.value[0]!.data as SessionStartPayload).assignment.id).toBe('hw1');
  });

  it('still records when the server cannot report host facts', async () => {
    const { server, run } = await scenario();
    server.hostFacts = () => Promise.resolve({ ok: false, message: 'HTTP 500' });
    const outcome = await run();
    const session = outcome.registry.all()[0]!;
    const parsed = parseEntries(server.text([...server.files.keys()][0]!));
    if (!parsed.ok) throw new Error('log did not parse');
    expect((parsed.value[0]!.data as SessionStartPayload).machine_id).toBe(
      computeMachineId(UNKNOWN_HOST, session.sessionId),
    );
  });

  it('starts nothing and reports why when manifests cannot be listed', async () => {
    const { server, run } = await scenario();
    server.listManifests = () => Promise.resolve({ ok: false, message: 'HTTP 403' });
    const outcome = await run();
    expect(outcome.registry.all()).toEqual([]);
    expect(outcome.discoveryError).toBe('HTTP 403');
    expect(server.files.size).toBe(0);
  });

  it('keeps recording other folders when one cannot start', async () => {
    const { server } = await scenario();
    const root = await testKey();
    server.manifests = [
      {
        dir: 'a',
        name: '.provenance-manifest',
        text: JSON.stringify(await signedManifest({ root })),
      },
      {
        dir: 'b',
        name: '.provenance-manifest',
        text: JSON.stringify(await signedManifest({ root })),
      },
    ];
    const original = server.appendLog.bind(server);
    server.appendLog = (dir, ...rest) =>
      dir === 'a' ? Promise.reject(new Error('disk gone')) : original(dir, ...rest);
    const outcome = await activate({
      server,
      clock: new FixedClock(),
      recorderVersion: '0.0.0',
      jupyterlabVersion: '4.5.0',
      rootPubkeyHex: root.publicKeyHex,
      timers: noTimers,
    });
    expect(outcome.failed.map((f) => f.root)).toEqual(['a']);
    expect(outcome.registry.all().map((s) => s.root)).toEqual(['b']);
  });
});
