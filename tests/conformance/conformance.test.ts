/**
 * Conformance: conformance vectors from the monorepo. A failure means the code is wrong,
 * never the vector.
 *
 * provjup imports log-core rather than porting it, so these tests prove two things: the
 * pinned submodule still reproduces the exported vectors, and log-core reaches this repo
 * only through `src/core/`, unchanged.
 *
 * Covered so far: the pinned SHA-256 and hash-chain vectors. The other fixtures (keys,
 * checkpoints, manifests, golden bundle) gate code that lands in Tasks 4 to 8.
 */

import { describe, expect, it } from 'vitest';
import { chainEntry, sha256Hex } from '../../src/core/index';
import type { Envelope } from '../../src/core/index';
import vectorsJson from './fixtures/vectors.json';

interface Vectors {
  sha256: { input: string; hex: string }[];
  chain: { prev_hash: string; envelope: Envelope; hash: string }[];
}

const vectors = vectorsJson as unknown as Vectors;

describe('conformance: vectors.json', () => {
  it('has vectors to check', () => {
    expect(vectors.sha256.length).toBeGreaterThan(0);
    expect(vectors.chain.length).toBeGreaterThan(0);
  });

  it.each(vectors.sha256)('sha256($input)', ({ input, hex }) => {
    expect(sha256Hex(input)).toBe(hex);
  });

  it.each(vectors.chain)('chainEntry reproduces the pinned hash at seq $envelope.seq', (v) => {
    const entry = chainEntry(v.prev_hash, v.envelope);
    expect(entry.hash).toBe(v.hash);
    expect(entry.prev_hash).toBe(v.prev_hash);
  });
});
