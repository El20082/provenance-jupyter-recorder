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
| B4 | Confirm the build dependencies added in step 3, which a real build cannot avoid: `@jupyterlab/application` (runtime, supplied by JupyterLab itself), `@jupyterlab/builder` (build only), `jupyter_server` (runtime, already on DataHub), and `hatchling`, `hatch-jupyter-builder` and `jupyterlab` (Python build only) | You | Already added, because you asked for the real build. Remove any you reject. |
| B5 | Wire `style/index.css` through `"style"` in `package.json`, or delete `style/` | You | `style/` stays unwired, which is harmless. Nothing needs CSS until the status item in Task 4. |
| B6 | Approve Python dev tools: `pytest`, `ruff`, `mypy` | You | They are configured in `pyproject.toml` but not installed, so the Python side is not linted or tested yet. Needed once `provjup/` gains real code in Task 4. |

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

### Step 3: The real build (Task 3)

**Dependencies added (blocker B4; all confirmed by the project owner on 2026-11-13):**

| Package | Range | Kind | Why |
| --- | --- | --- | --- |
| `@jupyterlab/application` | `^4.4.0` | npm runtime | Plugin types; JupyterLab supplies it at runtime |
| `@jupyterlab/builder` | `^4.4.0` | npm dev | Builds the prebuilt labextension |
| `jupyter_server` | `>=2.16.0,<3` | Python runtime | Hosts the server extension; DataHub has 2.16 |
| `hatchling`, `hatch-jupyter-builder`, `jupyterlab` | see `pyproject.toml` | Python build | Builds the frontend during `pip install` |

npm resolved `@jupyterlab/application` to `^4.6.6` by default. The range is widened to
`^4.4.0`, because JupyterLab checks it when loading the extension, and Data 101 and 102 run
4.4.5. npm blocked one install script, a font package's attribution message, which is safe to
skip.

**Files:**

| File | Change |
| --- | --- |
| `src/index.ts` | Plugin `provjup:plugin`, so the schema resolves to `schema/plugin.json`. It only logs that it loaded; activation is Task 4 |
| `provjup/__init__.py` | Labextension path, server extension point, and a load hook that logs |
| `pyproject.toml` | JupyterLab's extension-template build: `hatch-jupyter-builder`, shared-data for the labextension and server config, PyPI classifiers |
| `package.json` | `build`, `build:prod`, `build:lib` and `build:labextension` scripts |
| `Makefile` | `install`, `build`, `test`, `typecheck`, `lint`, `format` and `vectors` targets |
| `README.md`, `vendor/README.md`, `2026-10-30-plan.md` | Status and Development instructions updated; Task 3 boxes ticked |

**Verified,** in a scratch Python 3.14 environment with JupyterLab 4.5.0, the Data 100 version:

| Check | Result |
| --- | --- |
| `jupyter labextension build .` | Compiled successfully |
| `pip install -e .` | Succeeds; `jupyter labextension list` and `jupyter server extension list` show `provjup` enabled and valid |
| Real JupyterLab in headless Chrome | The console shows `provjup:plugin: loaded`, with no errors. The server log shows the server extension linked and loaded |
| `npm test`, `npm run typecheck`, `npm run lint` | 54 passed, 83 todo; clean; clean |

**Not verified:**
- JupyterLab 4.4.5, the Data 101 and 102 version. Expected to work from the version range, but
  untested.
- `make` itself, because it is not installed on this machine; each target only calls an npm
  script that was run directly.
- The Python side's lint, type and unit checks (blocker B6).

**Noticed for Task 4:** once `src/index.ts` imports log-core, `@noble/*` and `canonicalize`
are bundled into the extension, and each needs an entry in `THIRD-PARTY-NOTICES.txt`.

## Where this leaves the plan

- The review's findings are all fixed, and Task 3 is complete apart from blockers B4 to B6.
- Task 4 (activation, session lifecycle, writer through the server) and the text-file half
  of Task 5 can start without outside input.
- The notebook half of Task 5 waits on B1 and B2 before students can use it.
