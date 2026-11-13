/**
 * Builds real, signed Manifest 2.0 files for tests: a root key signs the course cert, and
 * the course key signs the manifest. Mirrors `buildV2Manifest` in the VS Code recorder's
 * manifest-loader.test.ts. Keys are fresh per call, never the real root key.
 */

import { generateSessionKeypair, signCourseCert, signManifest } from '../../src/core/index';

export interface TestKey {
  publicKeyHex: string;
  privateKey: Uint8Array;
}

export async function testKey(): Promise<TestKey> {
  return generateSessionKeypair();
}

export async function signedManifest(opts: {
  root: TestKey;
  course?: TestKey;
  assignmentId?: string;
  filesUnderReview?: string[];
}): Promise<Record<string, unknown>> {
  const course = opts.course ?? (await testKey());
  const certBody = {
    course_id: 'berkeley-data100',
    course_pubkey: course.publicKeyHex,
    valid_from: '2026-08-20',
    valid_until: '2027-01-15',
  };
  const rootSig = await signCourseCert(certBody, opts.root.privateKey);
  const payload = {
    format_version: '2.0',
    assignment_id: opts.assignmentId ?? 'hw1',
    semester: 'fa26',
    issued_at: '2026-09-08T00:00:00Z',
    files_under_review: opts.filesUnderReview ?? ['hw1.ipynb'],
    ignore: [],
    attachments: [],
    course_id: 'berkeley-data100',
    collaboration: 'solo' as const,
    submission: 'bundle' as const,
    scope: 'directory' as const,
    policy: {
      capture: {
        selection_change: true,
        focus_change: true,
        terminal: true,
        heartbeat_interval_ms: 30000,
      },
    },
    course_cert: { ...certBody, root_sig: rootSig },
  };
  const sig = await signManifest(payload, course.privateKey);
  return { ...payload, sig };
}
