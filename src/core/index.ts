/**
 * The single import site for log-core. This repo has no format port: everything here is
 * re-exported unchanged from the monorepo's `packages/log-core`, pinned by the
 * `vendor/provenance` submodule.
 *
 * Import log-core only through this module, so the boundary stays reviewable.
 */

export {
  chainEntry,
  sha256Hex,
  GENESIS_PREV_HASH,
  validateChain,
  serializeEntry,
  parseEntries,
  SystemClock,
  FixedClock,
  DEFAULT_CAPTURE_POLICY,
  FLOOR_EVENT_KINDS,
  isEventKindCaptured,
} from '@provenance/log-core';

export type {
  Clock,
  CapturePolicy,
  Envelope,
  HashedEnvelope,
  EventKind,
  EventPayload,
  DocOpenPayload,
  DocChangePayload,
  DocChangeDelta,
  DocSavePayload,
  DocClosePayload,
  Position,
  Range,
} from '@provenance/log-core';
