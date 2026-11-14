/**
 * Pure transforms from document text and edits to log-core doc.* payloads.
 *
 * Ported from the VS Code recorder's `events/doc-events.ts`. VS Code receives ranges from its
 * editor; JupyterLab's shared models report Quill-style deltas instead, so this module also
 * turns a delta into ranges against the text before the change, bottom to top, which is how
 * analysis-core's `applyDocChange` replays them.
 */

import { sha256Hex } from '../../core/index';
import type { DocChangeDelta, DocOpenPayload, DocSavePayload } from '../../core/index';
import { editsFromOps, type SourceOp } from '../../notebook/cell-delta';
import { positionInSource } from '../../notebook/offset-map';

/** doc.open inlines content up to this many UTF-8 bytes, as in VS Code. */
export const MAX_INLINE_BYTES = 64 * 1024;

const encoder = new TextEncoder();

export function docOpenPayload(path: string, text: string): DocOpenPayload {
  const payload: DocOpenPayload = {
    path,
    sha256: sha256Hex(text),
    line_count: text.split('\n').length,
  };
  if (encoder.encode(text).length <= MAX_INLINE_BYTES) payload.content = text;
  else payload.truncated = true;
  return payload;
}

export function docSavePayload(path: string, savedText: string): DocSavePayload {
  return { path, sha256: sha256Hex(savedText) };
}

/** Ranges for an edit to `oldText`, in line/character form, ordered bottom to top. */
export function textEditDeltas(oldText: string, ops: readonly SourceOp[]): DocChangeDelta[] {
  const edits = editsFromOps(ops);
  const deltas: DocChangeDelta[] = [];
  for (let i = edits.length - 1; i >= 0; i--) {
    const edit = edits[i]!;
    deltas.push({
      range: {
        start: positionInSource(oldText, edit.at),
        end: positionInSource(oldText, edit.at + edit.deleteCount),
      },
      text: edit.text,
    });
  }
  return deltas;
}

/**
 * A JupyterLab shared-model delta (`@jupyter/ydoc`'s `Delta<string>`) as source ops.
 * Returns `null` for anything unexpected, so the caller can resynchronize instead of guessing.
 */
export function normalizeDelta(delta: unknown): SourceOp[] | null {
  if (!Array.isArray(delta)) return null;
  const ops: SourceOp[] = [];
  for (const item of delta as unknown[]) {
    if (typeof item !== 'object' || item === null) return null;
    const { insert, delete: remove, retain } = item as Record<string, unknown>;
    if (typeof insert === 'string') ops.push({ insert });
    else if (typeof remove === 'number') ops.push({ delete: remove });
    else if (typeof retain === 'number') ops.push({ retain });
    else return null;
  }
  return ops;
}
