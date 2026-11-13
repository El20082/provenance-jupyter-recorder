# Task 4: activation, session start and log writing (progress log)

Started 2026-11-13 on branch `feat/task-4-activation`, stacked on PR #5 (`chore/real-build`).
Goal, from `2026-10-30-plan.md`: activate only on a verified `.provenance-manifest`, start a
session, and append its hash-chained log to `.provenance/session-<uuid>.slog` through the
server extension. The gate: in real JupyterLab, a verified folder produces a `session.start`
that passes log-core's chain validator, and an unverified folder produces nothing.

**In scope,** from VS Code's `startSession` steps 3a to 6: the `.provenance/` folder, the
capture policy, the session keypair, the `session.start` context, the buffered writer, the
session host, `session.start` itself, and `session.end` when the session ends.

**Later tasks:** identity and enrollment (Task 8); chain recovery, `.slog.meta`, the rolling
seal and `.gitattributes` (Task 7); the signal wiring for edits (Tasks 5 and 6).

## Blockers

Numbering continues from `2026-11-13-log-core-fix-and-build.md`.

| # | Blocker | Who | Effect until resolved |
| --- | --- | --- | --- |
| B6 | Python dev tools | You | **Resolved 2026-11-13:** `pytest`, `ruff` and `mypy` approved |
| B7 | Land the approved `'jupyterlab'` value in log-core's `HostInfo.editor` | Monorepo owner | `session.start` cannot carry `host`, so it uses the older `vscode` block filled with JupyterLab's values, as `provjet` and `provnvim` do. Valid today; the analyzer cannot tell a JupyterLab session from a VS Code one |

## Steps

### Step 1: Server routes for manifests and log appends

The server extension now has three routes, all requiring Jupyter's login, under
`<base_url>/provjup/`:

| Route | What it does |
| --- | --- |
| `GET manifests` | Lists every manifest under the server root, with its raw text. Verifying is the frontend's job |
| `POST log/append` | Appends bytes to `<folder>/.provenance/session-<uuid>.slog`, only at the byte offset the frontend expects |
| `GET host` | Hostname, username and OS, for `session.start.machine_id` and `platform` |

Safety rules, each tested:

- Every path is relative to the server root. Absolute paths, `..`, backslashes and symlinks
  that resolve outside the root are refused.
- Only a file named `session-<uuid>.slog` can be written, and only inside a folder that holds
  a manifest, so a request cannot create `.provenance/` anywhere else.
- An append at the wrong offset is refused with the file's real size, and nothing is written.
  A retried request therefore cannot duplicate or reorder log lines.
- Manifest discovery skips hidden folders, `node_modules` and `__pycache__`, stops 8 levels
  deep, and ignores manifests over 1 MB. On DataHub the server root is the student's home
  directory, so this keeps discovery fast.

Python dev tools (B6, approved): `pytest`, `ruff` and `mypy` are a `dev` dependency group in
`pyproject.toml`, so they are never installed for students.

**Verified:** 32 pytest tests pass; `ruff check`, `ruff format --check` and strict `mypy` are
clean. The handlers themselves are thin and are exercised in the real-JupyterLab gate at the
end of this task.

**Choice made:** the offset check is an addition to VS Code's writer, which drops lines on a
failed write. Going through HTTP adds the risk of a retried request appending twice, which a
local file handle does not have.

### Step 2: Server client and manifest verification

| File | What it does |
| --- | --- |
| `src/recorder/io/server-client.ts` | Calls the three server routes through JupyterLab's `ServerConnection`. Every method returns a value; none throws |
| `src/recorder/activation/root-public-key.ts` | The embedded root key: the VS Code recorder's DEV root key, so the monorepo's dev manifests work here too. A release swaps in the production key (Task 9) |
| `src/recorder/activation/manifest-loader.ts` | Parses and verifies manifest text through log-core's `verifyManifestChain` |
| `src/recorder/activation/manifest-discovery.ts` | Verifies every manifest the server lists; failures are reported as skipped and never recorded |
| `tests/support/manifests.ts` | Builds real signed 2.0 manifests with fresh test keys, like VS Code's tests |

**Difference from VS Code:** only Manifest 2.0 is accepted. provjup has no 1.x history, so it
has no grandfathered legacy course key, and a 1.x manifest is refused with
`legacy_manifest_unsupported` (design §6).

**Dependencies added,** both supplied by JupyterLab at runtime, like `@jupyterlab/application`
(B4): `@jupyterlab/services` `^7.4.0` and `@jupyterlab/coreutils` `^6.4.0`. Both ranges match
what JupyterLab 4.4.0 itself requires.

**Verified:** 9 tests. A valid manifest is accepted; a changed payload, a changed course cert,
a different root key, a 1.x manifest and non-JSON text are all refused without throwing.
Typecheck, ESLint and Prettier are clean.

### Step 3: Session writer and session start

| File | What it does |
| --- | --- |
| `src/recorder/io/session-writer.ts` | Port of VS Code's writer: synchronous `append`, log-core's buffer policy (1 s or 256 KB), one flush at a time so writes stay ordered |
| `src/recorder/session/recorder-context.ts` | Builds `session.start`: assignment, full manifest, `manifest_sig`, `machine_id`, `file_scope`, recorder id `provjup`, session public key |
| `src/recorder/session/recording-session.ts` | VS Code's `startSession` steps 3a to 6: capture policy, keypair, context, writer, host, `session.start` written immediately; `end()` emits `session.end` |
| `src/recorder/session/session-registry.ts` | One session per assignment root; ends them in order |
| `tests/support/fake-server.ts` | In-memory server with the same offset rule as the Python one; can fail or lose replies on demand |

**Choices made:**

- **Failed writes are retried, not dropped.** VS Code drops buffered lines when a write
  fails, because retrying could duplicate them. The server's offset check removes that risk,
  so failed lines stay buffered and go out on the next flush. If a retry finds the bytes
  already written, because only the reply was lost, it counts them as written. This follows
  the granularity rule: losing keystrokes silently is worse than writing them late.
- **`machine_id` hashes the server's hostname and user,** as VS Code does with the local ones,
  because a browser cannot read them. It changes per session, so sessions are not linkable
  through it.
- **`session.start` uses the older `vscode` block** filled with JupyterLab's version and the
  server's OS, because of blocker B7.
- **The session private key stays in memory.** Persisting it, encrypted in `.slog.meta`, is
  Task 7. Until then, a reloaded page cannot sign for an earlier session.

**Verified:** 53 recorder tests. Among them: entries land in order and chain-validate; a failed
write keeps its lines and writes them later in order; a lost reply does not duplicate lines; a
foreign write to the log is reported; `session.start` is written at once and passes log-core's
parser and validator; `session.end` is chained last; ending twice is harmless.

### Step 4: Activation in the plugin, and the real-JupyterLab gate

| File | What it does |
| --- | --- |
| `src/recorder/activation/activation.ts` | Discovers manifests, then starts one session per verified root, each in isolation as in VS Code, so one folder that cannot start never stops the others. If the server cannot report host facts, recording still starts |
| `src/index.ts` | Runs activation when JupyterLab starts, reports skipped and failed folders in the console, and ends every session on `pagehide` |
| `THIRD-PARTY-NOTICES.txt` | Licenses for the libraries now bundled through log-core: `@noble/ed25519`, `@noble/hashes`, `@noble/ciphers` (MIT) and `canonicalize` (Apache-2.0) |

**The gate.** In JupyterLab 4.5.0 with headless Chrome, using a server root holding three
folders:

| Folder | Manifest | Result |
| --- | --- | --- |
| `data100/hw1` | Valid, signed under a test root key | Recorded: `.provenance/session-<id>.slog` created |
| `data100/hw2` | Same manifest with its assignment id changed | Refused as `manifest_chain_invalid`; nothing written |
| `data100/hw3` | None | Ignored; nothing written |

The log on disk was then checked with log-core: it parses, `validateChain` returns ok, the file
name matches `session.start.session_id`, and it holds `session.start` then `session.end`,
written when the browser closed.

The test root key was swapped in only for that build and restored at once. The final build
contains the real dev root key and not the test key, both checked.

**Found during the gate:** an editable `pip install` copies the frontend once, so rebuilding
changed nothing JupyterLab served. `jupyter labextension develop . --overwrite` links it
instead; the README now says so.

**Verified overall:**

| Check | Result |
| --- | --- |
| `npm test` | 84 passed, 77 todo |
| `npm run typecheck`, `npm run lint` | Clean |
| `pytest`, `ruff check`, `ruff format --check`, `mypy` | 32 passed; clean |

**Not done in Task 4,** by design: the notebook and editor signals are not connected, so no
edits are recorded yet (Tasks 5 and 6). There is no status item, no `.slog.meta`, no chain
recovery after a reload, and no rolling seal (Task 7). The analyzer gate script cannot run yet,
because a bundle needs `.slog.meta` and a seal.

**Not verified:**
- JupyterLab 4.4.5, which Data 101 and 102 run.
- More than one browser tab open on the same notebook. Each tab would start its own session
  today; `tab-ownership.ts` is still a stub (Task 7).
- Whether the log routes keep a DataHub server from shutting down when idle (Task 6).

## Summary for the project owner

Task 4 is complete. The recorder now starts, verifies assignments and writes valid, chained
logs in real JupyterLab. The only new blocker is B7 (monorepo owner). The new runtime
dependencies, `@jupyterlab/services` and `@jupyterlab/coreutils`, are supplied by JupyterLab
itself and fall under B4.
