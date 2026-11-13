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

| # | Blocker | Who | Effect until resolved |
| --- | --- | --- | --- |
| B1 | Approve the `view` field and the `ipynb-source-v1` projection (`docs/monorepo-owner-requests.md` item 1) | Monorepo owner | `doc.open` for a notebook carries no `view` marker, so the analyzer treats the view as a plain file, and check 8 would report a mismatch against the submitted `.ipynb`. The projection lives in `src/notebook/text-view.ts` until it moves to log-core. Fine for development; must be resolved before students use it. |
| B2 | Decide the text-view edge cases (item 2): notebooks before nbformat 4.5, and `
` in cell sources | Monorepo owner, then you | Notebooks without cell ids are **not recorded at all**, by returning `missing_cell_id`. `
` passes through unchanged. |
| B3 | Decision 7: copy shared VS Code helpers or move them into a package | You | `MAX_INLINE_BYTES` (64 KB) is copied into `notebook-wiring.ts`, and the replay helper in `tests/support/replay.ts` copies analysis-core's. Each copy can drift. |

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

### Step 2: Fix the log-core integration

Each review finding, and what fixed it:

| Review finding | Fix |
| --- | --- |
| No hash chain: `session-host.ts` never called `chainEntry` | Replaced with a direct port of VS Code's `createSessionHost`: `chainEntry`, `seq`, `t` from the monotonic clock, `wall` from the wall clock, and the capture-policy gate |
| The real parser rejected the output | Every event is now a log-core `HashedEnvelope`. A test serializes the output, parses it with log-core's `parseEntries` and checks it with `validateChain` |
| `doc.change` was not log-core's shape | Emits `deltas` of line/character ranges plus `source: 'typed'`, in bottom-to-top order, which is how the analyzer's `applyDocChange` replays them |
| Other payloads did not match | The wiring now emits only `doc.open`, `doc.change`, `doc.save` and `doc.close`, each typed as log-core's payload, so the compiler rejects a wrong shape |
| Four unapproved event kinds | Removed: `cell.execution.start`, `cell.execution.end`, `notebook.cells.change`, `kernel.lifecycle`. They wait on decisions 1 and 10 |
| Whole-notebook comparison on every keystroke | Each cell edit becomes its own delta. Cell additions, deletions and moves replace only the blocks between unchanged neighbours, and a type change rewrites one header line |
| Emoji split into a lone surrogate | Fixed by the per-edit deltas; a test covers it |
| Fresh clone did not build; `TS5096` | Fixed in step 1 |
| No tests | 54 tests now run (below) |

Files:

| File | What it does |
| --- | --- |
| `src/core/index.ts` | Re-exports exactly the log-core API in use |
| `src/recorder/session/session-host.ts` | VS Code's session host, ported unchanged |
| `src/notebook/text-view.ts` | The draft projection, plus `checkCells`, which reports missing or duplicate ids as a value instead of throwing |
| `src/notebook/offset-map.ts` | Cell offset to view line/character, caching each cell's newline count |
| `src/notebook/cell-delta.ts` | Yjs-format source changes and cell-list changes to `doc.change` deltas |
| `src/notebook/view-save.ts` | Saved `.ipynb` text to the view and its hash for `doc.save` |
| `src/recorder/wiring/notebook-wiring.ts` | `NotebookWiring`, which replaces `ActivityRecorder` |

**Moved out of the wiring, not lost:**
- Lillian's paste, selection and focus handling, and the heartbeat timer, belong in their own modules, in Task 6.
- `session.start` and `session.end` need the verified manifest and keys, so they belong to the session lifecycle, in Task 4.

**Verified:**

| Check | Result |
| --- | --- |
| `npm test` | 54 passed, 83 todo |
| `npm run typecheck`, ESLint, Prettier | Clean |
| Random replay | 2,000 random source and cell-list edits, including emoji and newlines, replay to exactly the expected view |
| End to end | Edits go through the real session host; log-core parses the output, the chain validates, replay matches the final notebook, and the `doc.save` hash matches |
| Conformance | The pinned SHA-256 and hash-chain vectors pass through `src/core/` |

**Keystroke cost** (one character typed into the middle cell of a 40-cell notebook, 2,000 samples, Node on this machine; a browser will differ):

| Notebook size | Before (review) p99 | Wiring only p99 | Wiring and chaining p99 |
| --- | --- | --- | --- |
| 10 KB | 1.51 ms | 0.024 ms | 0.087 ms |
| 100 KB | 4.10 ms | 0.023 ms | 0.077 ms |
| 500 KB | 11.27 ms | 0.097 ms | 0.157 ms |
| 2 MB | 39.35 ms | 0.281 ms | 0.338 ms |

All sizes are now under the 1 ms p99 target. Chaining runs on every keystroke, as in VS Code;
signing does not.

**Not verified yet:** that JupyterLab's shared-cell change events use the Yjs delta format with
UTF-16 offsets. That is checked when the wiring connects to real JupyterLab signals.
