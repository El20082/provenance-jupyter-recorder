# Log-core fix and real build (progress log)

Started 2026-11-13 on branch `feat/log-core-fix-and-build`, from `scaffold/initial` at
`10a6039`. This log records each step as it happens, what was verified, and every blocker
that needs input from the project owner or the monorepo owner.

The work has two parts:

1. Fix the `log-core` integration merged in `0a5dd7e` and `a2ae7c9`, using the findings of the
   2026-10-30 review.
2. Start Task 3 of `2026-10-30-plan.md`: the real build.

## Blockers

Blockers are numbered once and never renumbered. Each says who must act.

(None yet.)

## Steps

### Step 0: Housekeeping

- Fast-forwarded `scaffold/initial` to `10a6039` and initialized the `vendor/provenance`
  submodule at `fe3a290`.
- Committed two files left uncommitted since 2026-10-30 (`ddb97f2`): the shared `.gitignore`
  rules and the analyzer gate script copied from `provnvim`.

### Step 1: Test and build tooling

Added only the tools approved on 2026-10-30, at the monorepo's versions:

| Package | Version | Why |
| --- | --- | --- |
| `typescript` | 5.9.3 | Typecheck and emit; the monorepo uses `^5.6.0` |
| `vitest` | 4.1.12 | Test runner (decision 13) |
| `eslint`, `typescript-eslint` | 9.39.5, 8.72.2 | Linting (decision 13) |
| `prettier` | 3.10.1 | Formatting (decision 13) |

Files added:

- `tsconfig.log-core.json` builds the submodule's `log-core` into its own `dist/`, excluding its
  test files, which need monorepo-only dependencies. The monorepo ignores `dist/`, so the
  submodule stays clean. `npm run build:core` runs it, and `prepare` runs it on `npm install`.
  This fixes "a fresh clone does not build" from the review.
- `tsconfig.json` (typecheck of `src` and `tests`) and `tsconfig.build.json` (emits `lib/`).
  Strictness matches the monorepo's `tsconfig.base.json`. `allowImportingTsExtensions` is
  removed, which fixes the `TS5096` emit error from the review.
- `eslint.config.mjs`, `.prettierrc`, `.prettierignore`, `.nvmrc` (Node 22), copied or adapted
  from the monorepo.
- `scripts/vitest.mjs` launches Vitest. On Windows, a shell in `c:\...` made Vitest load
  twice and fail every suite with "failed to find the current suite". The launcher restarts
  Vitest from the canonical path.
- 90 empty test stubs now call `it.todo`, so they report as pending instead of failing.

**Verified:** `npm run build:core` exits 0, and the suite reports 90 files, 90 todo.
`npm run typecheck` fails only on `notebook-wiring.ts`, fixed in step 2.
