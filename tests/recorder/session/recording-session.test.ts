import { beforeAll, describe, expect, it } from 'vitest';
import { FixedClock, parseEntries, validateChain } from '../../../src/core/index';
import type { HashedEnvelope, Manifest, SessionStartPayload } from '../../../src/core/index';
import { verifyManifestText } from '../../../src/recorder/activation/manifest-loader';
import type { Timers } from '../../../src/recorder/io/session-writer';
import {
  slogFileName,
  startRecordingSession,
} from '../../../src/recorder/session/recording-session';
import { SessionRegistry } from '../../../src/recorder/session/session-registry';
import { FakeServer } from '../../support/fake-server';
import { signedManifest, testKey } from '../../support/manifests';

const SESSION_ID = '00000000-0000-4000-8000-0000000000aa';
const noTimers: Timers = { setInterval: () => 0, clearInterval: () => undefined };

let manifest: Manifest;

beforeAll(async () => {
  const root = await testKey();
  const result = await verifyManifestText(
    JSON.stringify(await signedManifest({ root })),
    root.publicKeyHex,
  );
  if (!result.ok) throw new Error('fixture manifest did not verify');
  manifest = result.value;
});

async function start(server: FakeServer, root = 'data100/hw1', sessionId = SESSION_ID) {
  return startRecordingSession({
    server,
    root,
    manifest,
    clock: new FixedClock(0, new Date('2026-11-13T00:00:00.000Z')),
    host: server.host,
    recorderVersion: '0.0.0',
    jupyterlabVersion: '4.5.0',
    newSessionId: () => sessionId,
    timers: noTimers,
  });
}

function entries(server: FakeServer, path: string): readonly HashedEnvelope[] {
  const result = parseEntries(server.text(path));
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}

describe('startRecordingSession', () => {
  it('writes a chained session.start to .provenance/session-<id>.slog straight away', async () => {
    const server = new FakeServer();
    const session = await start(server);
    const path = `data100/hw1/.provenance/${slogFileName(SESSION_ID)}`;
    const log = entries(server, path);
    expect(log.map((e) => e.kind)).toEqual(['session.start']);
    expect(validateChain(log).ok).toBe(true);
    const data = log[0]!.data as SessionStartPayload;
    expect(data.session_id).toBe(SESSION_ID);
    expect(data.session_pubkey).toBe(session.sessionPubkeyHex);
    expect(data.manifest_sig).toBe(manifest.sig);
  });

  it('ends with session.end, chained after everything else; end is idempotent', async () => {
    const server = new FakeServer();
    const session = await start(server);
    session.host.emit('doc.close', { path: 'hw1.ipynb' });
    await session.end('closed');
    await session.end('closed again');
    const log = entries(server, `data100/hw1/.provenance/${slogFileName(SESSION_ID)}`);
    expect(log.map((e) => e.kind)).toEqual(['session.start', 'doc.close', 'session.end']);
    expect(log[2]!.data).toEqual({ reason: 'closed' });
    expect(validateChain(log).ok).toBe(true);
  });
});

describe('SessionRegistry', () => {
  it('ends every session and forgets them', async () => {
    const server = new FakeServer();
    const registry = new SessionRegistry();
    registry.add(await start(server, 'hw1', '00000000-0000-4000-8000-000000000001'));
    registry.add(await start(server, 'hw2', '00000000-0000-4000-8000-000000000002'));
    expect(registry.get('hw2')?.sessionId).toBe('00000000-0000-4000-8000-000000000002');
    await registry.endAll('shutdown');
    expect(registry.all()).toEqual([]);
    for (const root of ['hw1', 'hw2']) {
      const file = [...server.files.keys()].find((p) => p.startsWith(`${root}/`))!;
      expect(entries(server, file).map((e) => e.kind)).toEqual(['session.start', 'session.end']);
    }
  });
});
