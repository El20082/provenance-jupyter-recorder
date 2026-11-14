/**
 * Which assignment-relative paths may be recorded.
 *
 * The recorder never records its own artifacts: anything in `.provenance/`, and the
 * manifest itself. Recording them would inline the live log into the log, and, in VS Code,
 * caused a self-feeding loop when the log was open in an editor (`wiring/doc-wiring.ts`,
 * `isProvenanceArtifact`).
 */

import { MANIFEST_FILE_NAMES } from '../activation/manifest-loader';

export function isRecordable(assignmentPath: string): boolean {
  if (assignmentPath === '') return false;
  if ((MANIFEST_FILE_NAMES as readonly string[]).includes(assignmentPath)) return false;
  return assignmentPath !== '.provenance' && !assignmentPath.startsWith('.provenance/');
}
