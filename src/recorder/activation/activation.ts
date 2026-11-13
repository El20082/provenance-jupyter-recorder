/**
 * Top-level activation: find verified assignment roots and start one session for each.
 *
 * Follows the VS Code recorder's `extension.ts` activate(): discover, then start each root
 * in isolation, so one folder that cannot be recorded never stops the others. A folder whose
 * manifest does not verify is never recorded and gets no `.provenance/` (PRD §4.1).
 */

import type { Clock } from '../../core/index';
import type { HostFacts, ProvjupServer } from '../io/server-client';
import type { Timers, WriterProblem } from '../io/session-writer';
import { startRecordingSession } from '../session/recording-session';
import { SessionRegistry } from '../session/session-registry';
import { discoverManifests, type ManifestSkip } from './manifest-discovery';

export interface ActivationDeps {
  server: ProvjupServer;
  clock: Clock;
  recorderVersion: string;
  jupyterlabVersion: string;
  rootPubkeyHex?: string;
  timers?: Timers;
  onProblem?: (root: string, problem: WriterProblem) => void;
}

export interface ActivationOutcome {
  registry: SessionRegistry;
  skipped: ManifestSkip[];
  /** Roots that verified but could not start, with the reason. */
  failed: { root: string; message: string }[];
  /** Set when the server could not list manifests at all. */
  discoveryError?: string;
}

/** Used when the server cannot report host facts; recording must not depend on them. */
export const UNKNOWN_HOST: HostFacts = { hostname: 'unknown', username: 'unknown', platform: '' };

export async function activate(deps: ActivationDeps): Promise<ActivationOutcome> {
  const registry = new SessionRegistry();
  const discovered = await discoverManifests(deps.server, deps.rootPubkeyHex);
  if (!discovered.ok) {
    return { registry, skipped: [], failed: [], discoveryError: discovered.message };
  }

  const facts = await deps.server.hostFacts();
  const host = facts.ok ? facts.value : UNKNOWN_HOST;

  const failed: ActivationOutcome['failed'] = [];
  for (const { root, manifest } of discovered.found) {
    try {
      const session = await startRecordingSession({
        server: deps.server,
        root,
        manifest,
        clock: deps.clock,
        host,
        recorderVersion: deps.recorderVersion,
        jupyterlabVersion: deps.jupyterlabVersion,
        ...(deps.timers !== undefined ? { timers: deps.timers } : {}),
        ...(deps.onProblem !== undefined
          ? { onProblem: (problem: WriterProblem) => deps.onProblem?.(root, problem) }
          : {}),
      });
      registry.add(session);
    } catch (error) {
      failed.push({ root, message: String(error) });
    }
  }
  return { registry, skipped: discovered.skipped, failed };
}
