import { beforeAll, describe, expect, it } from 'vitest';
import { signManifest } from '../../../src/core/index';
import {
  resolveVerifiedCapturePolicy,
  verifyManifestText,
} from '../../../src/recorder/activation/manifest-loader';
import { signedManifest, testKey, type TestKey } from '../../support/manifests';

describe('verifyManifestText', () => {
  let root: TestKey;
  let manifest: Record<string, unknown>;

  beforeAll(async () => {
    root = await testKey();
    manifest = await signedManifest({ root });
  });

  it('accepts a 2.0 manifest that chains to the root key', async () => {
    const result = await verifyManifestText(JSON.stringify(manifest), root.publicKeyHex);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.assignment_id).toBe('hw1');
  });

  it('refuses a manifest whose payload was changed after signing', async () => {
    const tampered = { ...manifest, assignment_id: 'hw2' };
    const result = await verifyManifestText(JSON.stringify(tampered), root.publicKeyHex);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('manifest_chain_invalid');
  });

  it('refuses a manifest signed under a different root key', async () => {
    const other = await testKey();
    const result = await verifyManifestText(JSON.stringify(manifest), other.publicKeyHex);
    expect(result.ok).toBe(false);
  });

  it('refuses a course cert that was changed after the root signed it', async () => {
    const cert = manifest['course_cert'] as Record<string, unknown>;
    const tampered = { ...manifest, course_cert: { ...cert, valid_until: '2099-01-01' } };
    const result = await verifyManifestText(JSON.stringify(tampered), root.publicKeyHex);
    expect(result.ok).toBe(false);
  });

  it('refuses a 1.x manifest, because provjup has no legacy course key', async () => {
    const course = await testKey();
    const payload = {
      assignment_id: 'hw1',
      semester: 'fa26',
      issued_at: '2026-09-08T00:00:00Z',
      files_under_review: ['hw1.ipynb'],
    };
    const sig = await signManifest(payload, course.privateKey);
    const result = await verifyManifestText(
      JSON.stringify({ ...payload, sig }),
      course.publicKeyHex,
    );
    expect(result).toEqual({ ok: false, error: { kind: 'legacy_manifest_unsupported' } });
  });

  it('reports text that is not a manifest, without throwing', async () => {
    const result = await verifyManifestText('{not json', root.publicKeyHex);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('manifest_parse_error');
  });

  it('resolves the capture policy the course signed', async () => {
    const result = await verifyManifestText(JSON.stringify(manifest), root.publicKeyHex);
    if (!result.ok) throw new Error('expected a verified manifest');
    expect(resolveVerifiedCapturePolicy(result.value)).toMatchObject({
      selection_change: true,
      focus_change: true,
      terminal: true,
    });
  });
});
