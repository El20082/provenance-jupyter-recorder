# CLAUDE.md

Conventions for this repo. The `provenance` monorepo's CLAUDE.md is the parent reference.

- All format logic lives in TypeScript through `log-core`. Never re-implement it here.
- The Python server extension only moves bytes. The exception is `extension_hash`,
  which is gated by the monorepo's conformance vectors.
- Every log entry goes through `session-host.ts`. Events are append-only.
- Format changes land in the monorepo first, with explicit approval.
- No new dependencies without approval.
- Stop and ask on ambiguity. See "Open decisions" in README.md.
