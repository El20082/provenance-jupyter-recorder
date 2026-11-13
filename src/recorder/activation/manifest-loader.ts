/**
 * Verifies a `.provenance-manifest` against the embedded root key.
 *
 * Ported from the VS Code recorder's `activation/manifest-loader.ts`, minus file reading:
 * the server hands the frontend raw text, and verification happens here, through log-core.
 *
 * Differences from VS Code:
 * - Only Manifest 2.0 is accepted. provjup has no 1.x history and therefore no grandfathered
 *   legacy course key (design §6), so a 1.x manifest is refused, never verified.
 * - There is no `no_workspace` error; discovery reports what it found instead.
 */

import {
  MANIFEST_FORMAT_VERSION_2,
  manifestFormatVersion,
  parseManifest,
  resolveCapturePolicy,
  verifyManifestChain,
} from '../../core/index';
import type { CapturePolicy, Manifest, ManifestChainError, Result } from '../../core/index';
import { ROOT_PUBLIC_KEY_HEX } from './root-public-key';

export type ActivationError =
  | { kind: 'manifest_parse_error'; detail: unknown }
  | { kind: 'legacy_manifest_unsupported' }
  | { kind: 'manifest_chain_invalid'; detail: ManifestChainError };

export const MANIFEST_FILE_NAMES = ['.provenance-manifest', 'provenance-manifest'] as const;

/** Parse and verify manifest text. Never throws; a manifest that fails is never trusted. */
export async function verifyManifestText(
  text: string,
  rootPubkeyHex: string = ROOT_PUBLIC_KEY_HEX,
): Promise<Result<Manifest, ActivationError>> {
  const parsed = parseManifest(text);
  if (!parsed.ok)
    return { ok: false, error: { kind: 'manifest_parse_error', detail: parsed.error } };

  const manifest = parsed.value;
  if (manifestFormatVersion(manifest) !== MANIFEST_FORMAT_VERSION_2) {
    return { ok: false, error: { kind: 'legacy_manifest_unsupported' } };
  }
  const chain = await verifyManifestChain(manifest, rootPubkeyHex);
  if (!chain.ok)
    return { ok: false, error: { kind: 'manifest_chain_invalid', detail: chain.error } };
  return { ok: true, value: manifest };
}

/** The course's capture policy, from an ALREADY-VERIFIED 2.0 manifest. */
export function resolveVerifiedCapturePolicy(manifest: Manifest): CapturePolicy {
  return resolveCapturePolicy(manifest.policy);
}
