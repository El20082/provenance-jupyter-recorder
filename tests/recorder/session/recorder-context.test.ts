import { beforeAll, describe, expect, it } from 'vitest';
import { sha256Hex } from '../../../src/core/index';
import type { Manifest } from '../../../src/core/index';
import { verifyManifestText } from '../../../src/recorder/activation/manifest-loader';
import {
  EXTENSION_ID,
  buildRecorderContext,
  computeMachineId,
  resolveFileScope,
} from '../../../src/recorder/session/recorder-context';
import { signedManifest, testKey } from '../../support/manifests';

const host = { hostname: 'jupyter-student', username: 'jovyan', platform: 'Linux' };

describe('buildRecorderContext', () => {
  let manifest: Manifest;

  beforeAll(async () => {
    const root = await testKey();
    const text = JSON.stringify(await signedManifest({ root }));
    const result = await verifyManifestText(text, root.publicKeyHex);
    if (!result.ok) throw new Error('fixture manifest did not verify');
    manifest = result.value;
  });

  it('builds a session.start payload from the verified manifest', () => {
    const context = buildRecorderContext({
      manifest,
      sessionId: 'sid',
      prevSessionId: null,
      sessionPubkeyHex: 'ab'.repeat(32),
      host,
      recorderVersion: '0.0.0',
      jupyterlabVersion: '4.5.0',
    });
    expect(context).toMatchObject({
      format_version: '1.0',
      session_id: 'sid',
      prev_session_id: null,
      assignment: { id: 'hw1', semester: 'fa26' },
      manifest_sig: manifest.sig,
      manifest,
      recorder: { version: '0.0.0', extension_id: EXTENSION_ID },
      session_pubkey: 'ab'.repeat(32),
    });
  });

  it('fills the vscode block with JupyterLab values until log-core accepts host jupyterlab (B7)', () => {
    const context = buildRecorderContext({
      manifest,
      sessionId: 'sid',
      prevSessionId: null,
      sessionPubkeyHex: '',
      host,
      recorderVersion: '0.0.0',
      jupyterlabVersion: '4.5.0',
    });
    expect(context.vscode).toEqual({ version: '4.5.0', commit: '', platform: 'Linux' });
    expect('host' in context).toBe(false);
  });
});

describe('computeMachineId', () => {
  it('hashes hostname, user and session id together', () => {
    expect(computeMachineId(host, 'sid')).toBe(sha256Hex('jupyter-student:jovyan:sid'));
  });

  it('differs per session, so sessions are not linkable by it', () => {
    expect(computeMachineId(host, 'a')).not.toBe(computeMachineId(host, 'b'));
  });
});

describe('resolveFileScope', () => {
  it('lists exact paths and marks the scope complete', () => {
    expect(resolveFileScope(['hw1.ipynb', 'data.csv'])).toMatchObject({ complete: true });
  });

  it('marks the scope incomplete when the manifest uses folder or glob rules', () => {
    expect(resolveFileScope(['hw1.ipynb', 'data/'])).toMatchObject({ complete: false });
  });
});
