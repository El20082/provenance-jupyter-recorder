/**
 * Test-only copy of analysis-core's `applyDocChange` and `positionToOffset`
 * (vendor/provenance/packages/analysis-core/src/index/reconstruct-file.ts, at fe3a290).
 * Copied because analysis-core is not built here. If replay semantics change upstream,
 * update this copy; it exists only to prove our deltas replay the way the analyzer does.
 */

import type { DocChangeDelta } from '../../src/core/index';

function positionToOffset(content: string, line: number, character: number): number {
  const lines = content.split('\n');
  let offset = 0;
  for (let l = 0; l < line && l < lines.length; l++) {
    offset += (lines[l]?.length ?? 0) + 1;
  }
  const targetLine = lines[line] ?? '';
  offset += Math.min(character, targetLine.length);
  return Math.min(offset, content.length);
}

export function applyDeltas(content: string, deltas: readonly DocChangeDelta[]): string {
  let result = content;
  for (const delta of deltas) {
    const start = positionToOffset(result, delta.range.start.line, delta.range.start.character);
    const end = positionToOffset(result, delta.range.end.line, delta.range.end.character);
    result = result.slice(0, start) + delta.text + result.slice(end);
  }
  return result;
}
