/**
 * Finds every verified assignment root under the Jupyter server root.
 *
 * Ported from the VS Code recorder's `activation/manifest-discovery.ts`. The server lists
 * manifest files with their raw text; each is verified here. A manifest that fails is
 * reported as skipped, and that folder is never recorded.
 */

import type { Manifest } from '../../core/index';
import type { ProvjupServer } from '../io/server-client';
import { verifyManifestText, type ActivationError } from './manifest-loader';

export type DiscoveredManifest = { root: string; manifest: Manifest };
export type ManifestSkip = { root: string; error: ActivationError };

export type DiscoveryResult =
  | { ok: true; found: DiscoveredManifest[]; skipped: ManifestSkip[] }
  | { ok: false; message: string };

export async function discoverManifests(
  server: Pick<ProvjupServer, 'listManifests'>,
  rootPubkeyHex?: string,
): Promise<DiscoveryResult> {
  const listed = await server.listManifests();
  if (!listed.ok) return { ok: false, message: listed.message };

  const found: DiscoveredManifest[] = [];
  const skipped: ManifestSkip[] = [];
  // Sequential on purpose: results stay in the server's sorted folder order.
  for (const file of listed.value) {
    const result = await verifyManifestText(file.text, rootPubkeyHex);
    if (result.ok) found.push({ root: file.dir, manifest: result.value });
    else skipped.push({ root: file.dir, error: result.error });
  }
  return { ok: true, found, skipped };
}
