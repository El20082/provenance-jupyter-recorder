import { describe, expect, it } from 'vitest';
import { discoverManifests } from '../../../src/recorder/activation/manifest-discovery';
import type { ManifestFile, ProvjupServer } from '../../../src/recorder/io/server-client';
import { signedManifest, testKey } from '../../support/manifests';

function server(files: ManifestFile[] | null): Pick<ProvjupServer, 'listManifests'> {
  return {
    listManifests: () =>
      Promise.resolve(
        files === null ? { ok: false, message: 'HTTP 500' } : { ok: true, value: files },
      ),
  };
}

describe('discoverManifests', () => {
  it('keeps verified roots and skips the rest with a reason', async () => {
    const root = await testKey();
    const good = JSON.stringify(await signedManifest({ root, assignmentId: 'hw1' }));
    const other = JSON.stringify(await signedManifest({ root: await testKey() }));
    const result = await discoverManifests(
      server([
        { dir: 'data100/hw1', name: '.provenance-manifest', text: good },
        { dir: 'data100/hw2', name: '.provenance-manifest', text: other },
        { dir: 'scratch', name: 'provenance-manifest', text: 'nonsense' },
      ]),
      root.publicKeyHex,
    );
    if (!result.ok) throw new Error(result.message);
    expect(result.found.map((f) => [f.root, f.manifest.assignment_id])).toEqual([
      ['data100/hw1', 'hw1'],
    ]);
    expect(result.skipped.map((s) => [s.root, s.error.kind])).toEqual([
      ['data100/hw2', 'manifest_chain_invalid'],
      ['scratch', 'manifest_parse_error'],
    ]);
  });

  it('reports a server failure instead of throwing', async () => {
    expect(await discoverManifests(server(null))).toEqual({ ok: false, message: 'HTTP 500' });
  });
});
