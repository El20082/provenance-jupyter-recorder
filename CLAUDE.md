# CLAUDE.md

Conventions for this repo. The `provenance` monorepo's CLAUDE.md is the parent reference.
The approved design is `docs/design.md`; read it before implementing anything.

## What this is

`provjup`: a JupyterLab recorder producing bundles the Provenance analyzer accepts.
It is a port of the wiring, not a new product.

## The format contract

- The format is owned by the monorepo's `log-core`. Import it through `src/core/`.
  Never re-implement it here.
- If the format appears to need a change, stop and ask. Format changes land in the
  monorepo first, with explicit approval.
- Conformance failures mean the code is wrong. Never edit a vector.
- Never modify `manifest.json` or `manifest.sig` after seal.

## Architecture rules

- `src/` records. `provjup/` moves bytes and never builds or interprets log entries.
  The exception is `extension_hash`, gated by conformance vectors.
- Every log entry goes through `session-host.ts`. Events are append-only.
- Never sign or canonicalize on the keystroke path. Target p99 under 1 ms.
- Identity failure never blocks recording.
- The master secret never enters a workspace, `.provenance/`, a log or a bundle.
- Honeypot answers never reach the recorder, the manifest or the bundle.

## Working agreement

- Stop and ask on ambiguity. See "Open decisions" in README.md.
- No new dependencies without approval.
- No weakened tests without explaining why.
- Keep diffs small. Read a module and its tests before editing.
- Every background task has a dispose path.

## Testing

- `tests/` mirrors `src/`; `tests/server/` mirrors `provjup/`.
- Test event transforms as pure functions and mock at the seam.
- Inject clocks. Tests must be deterministic.
- New behavior gets tests; bug fixes get a regression test.
