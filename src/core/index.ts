/**
 * The single import site for log-core. This repo has no format port.
 *
 * TODO: not implemented. See docs/design.md.
 */

import { sha256Hex } from '@provenance/log-core';

export {
  sha256Hex,
  chainEntry,
  serializeEntry,
  GENESIS_PREV_HASH,
  generateSessionKeypair,
  signCheckpoint,
} from '@provenance/log-core';

export type {
  Envelope,
  EventKind,
  EventPayload,
  DocOpenPayload,
  DocChangePayload,
  DocSavePayload,
} from '@provenance/log-core';
