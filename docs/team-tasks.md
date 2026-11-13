# Open tasks for the team

Updated 2026-11-13. This is the list of work anyone on the team can pick up, with enough context
to start. For the full plan see [`plans/2026-10-30-plan.md`](plans/2026-10-30-plan.md); for where
things stand see [`project-status.md`](project-status.md).

## Before you start

**Read first:** [`CLAUDE.md`](../CLAUDE.md) (the repo's rules), [`design.md`](design.md), and the
"Development" section of the [README](../README.md) for setup.

**Where to branch from.** The working code is in pull requests #2 to #6, which are not merged
yet. Until they are, branch from `feat/task-4-activation`, the top of that stack. Once they are
merged, branch from `scaffold/initial`.

**Rules every task follows** (from `CLAUDE.md`; these are the ones most often missed):

- **Copy the VS Code recorder first.** Each task names the matching module in the monorepo's
  `packages/recorder/src/` (also at `vendor/provenance/packages/recorder/src/`). Read it and its
  tests, keep its behavior and names, and write down any difference JupyterLab forces.
- **Never change the log format here.** Every event must be one of log-core's types, emitted
  through `session.host.emit`. If you think you need a new field or event, stop and ask.
- **Record letter by letter.** No avoidable delay, and never merge separate edits into one event.
- **Students do nothing extra.** No new prompts, settings or buttons, apart from enrolling once.
- **The server only moves bytes.** Python code in `provjup/` never builds or reads log entries.
- **Keystroke handlers stay under 1 ms at p99.** No signing or hashing of large data on that path.
- **Tests:** pure functions tested directly, JupyterLab mocked at the seam, clocks injected.
  `npm test`, `npm run typecheck`, `npm run lint`, `pytest`, `ruff check provjup tests/server` and
  `mypy` must all pass.
- **No new dependencies without approval** from the project owner.
- **Commits:** conventional prefixes (`feat:`, `fix:` …), `git commit --no-gpg-sign`, one task
  per pull request, and a progress note in `docs/plans/` for anything larger than a day.

**To claim a task,** put your name in its Owner column in a small pull request, or tell the
project owner.

## Task list

Sizes: **S** is under a day, **M** is a few days, **L** is a week or more.

| ID | Task | Size | Depends on | Blocked by | Owner |
| --- | --- | --- | --- | --- | --- |
| 5.1 | Route paths to sessions | S | — | — | |
| 5.2 | Connect notebook edits to the recorder | M | 5.1 | — | |
| 5.3 | Record plain text files | M | 5.1 | — | |
| 6.1 | Heartbeats that survive hidden tabs | M | — | — | |
| 6.2 | Focus and selection events | S | 5.2, 5.3 | — | |
| 6.3 | Paste detection | L | 5.2, 5.3 | Decision 7 | |
| 6.4 | External changes on disk | L | 5.2 | Dependency approval (`watchdog`) | |
| 6.5 | Check DataHub idle shutdown | S | — | — | |
| 7.1 | `.slog.meta` and atomic writes | M | — | — | |
| 7.2 | Signed checkpoints | M | 7.1 | — | |
| 7.3 | Chain recovery after a reload | M | 7.1 | — | |
| 7.4 | Rolling seal and `extension_hash` | L | 7.2 | Monorepo request 3 | |
| 7.5 | Save, flush and seal on every cell run | S | 5.2, 7.4 | — | |
| 7.6 | One writer per session across tabs | M | — | Design not decided | |
| 7.7 | Degraded mode and status item | M | — | B5 | |
| 7.8 | Remove the seal-command stubs | S | — | — | |
| 8.1 | Terminal commands | M | 5.1 | — | |
| 8.2 | Git events | M | 5.1 | — | |
| 8.3 | Peer witnessing | M | 6.4 | — | |
| 8.4 | Identity and enrollment | L | 7.1 | Monorepo request 4 (wording) | |
| 8.5 | Extension snapshot and activation events | S | — | — | |
| 9.1 | End-to-end test in real JupyterLab | M | 7.4 | Dependency approval (Galata) | |
| 9.2 | Test on JupyterLab 4.4.5 | S | — | — | |
| 9.3 | Otter to Gradescope to `provgate` run | M | 7.4 | Course contact | |
| 9.4 | Data 100 image, then 101 and 102 | M | 9.1 | DataHub support answers | |
| 9.5 | Local Jupyter demo | S | 7.4 | — | |
| 9.6 | Guides: student, staff, hub, releasing | M | 9.3 | — | |
| 10 | Cell runs (`cell.execute`) and analyzer cell view | L | 5.2 | Decisions 1 and 10, monorepo approval | |

Outreach that is not code is at the end.

## Task details

Paths under `src/` and `provjup/` are this repo; "VS Code:" paths are under the monorepo's
`packages/recorder/src/`. Files marked *stub* exist and say "TODO: not implemented".

### Task 5: Edits

**5.1 Route paths to sessions.** Decide which session, if any, owns a file path, and turn it into
an assignment-relative path. Drop anything outside a verified root, plus `.provenance/` itself.
- Files: `src/recorder/session/session-router.ts`, `assignment-relative-path.ts` (stubs),
  `src/recorder/wiring/recordability-filter.ts` (stub).
- VS Code: `session/session-router.ts`, `session/assignment-relative-path.ts`.
- Done when: nested roots resolve to the innermost one, as in VS Code, and paths outside every
  root are dropped. Tested as pure functions.

**5.2 Connect notebook edits to the recorder.** `NotebookWiring` in
`src/recorder/wiring/notebook-wiring.ts` already turns notebook changes into `doc.*` events, and
is tested. Nothing calls it yet. Connect it to JupyterLab: `INotebookTracker` for open and close,
the shared notebook model's cell-list changes, each shared cell's source changes, and saves.
- New file: a JupyterLab adapter next to `notebook-wiring.ts`, plus `active-file-tracker.ts`
  (stub).
- **First, verify one assumption:** `sourceChanged` expects Yjs-format deltas
  (`retain` / `insert` / `delete`) with UTF-16 offsets. Confirm that JupyterLab's shared cell
  change event gives exactly that, and write a test from a real recorded event.
- Students cannot use notebook recording until the monorepo approves the `view` field (B1) and
  the edge cases (B2). Development can go ahead.
- Done when: typing in a cell in real JupyterLab produces one `doc.change` per edit, and
  replaying the log reproduces the notebook's view.

**5.3 Record plain text files.** `.py`, `.csv` and other files opened in JupyterLab's text
editor, recorded exactly as VS Code records them.
- Files: `src/recorder/wiring/file-editor-wiring.ts`, `src/recorder/events/doc-events.ts`
  (stubs).
- VS Code: `wiring/doc-wiring.ts`, `events/doc-events.ts`.
- Done when: open, edit, save and close of a `.py` file produce the same events as VS Code would.

### Task 6: Signals

**6.1 Heartbeats that survive hidden tabs.** `session.heartbeat` every 30 seconds, plus
`session.resumed` after a real gap and `clock.skew`.
- Files: `src/recorder/events/heartbeat.ts`, `clock-skew-watcher.ts` (stubs).
- VS Code: `events/heartbeat.ts`, `events/clock-watcher.ts`.
- **The catch:** browsers slow timers in hidden tabs, and VS Code's logic reads a gap of twice the
  interval as a suspend. Run the timer in a Web Worker, and test with a hidden tab in Chrome and
  Firefox. Every heartbeat must be logged, hidden tab included.

**6.2 Focus and selection events.** `focus.change` and `selection.change`, in view coordinates
for notebooks.
- Files: `src/recorder/wiring/focus-wiring.ts`, `selection-wiring.ts`,
  `src/recorder/events/focus-payloads.ts`, `selection-payloads.ts` (stubs).
- VS Code: `events/doc-events.ts` (`transformSelectionChange`, `transformFocusChange`).
- Use `OffsetMap` in `src/notebook/offset-map.ts` for notebook positions.

**6.3 Paste detection.** Three signals (the browser's paste event, the resulting edit, and
clipboard content), reconciled into exactly one `paste` event per paste. Do not simplify to one
signal without discussion.
- Files: `src/recorder/wiring/paste-intercept.ts`, `paste-assembly.ts`,
  `src/recorder/events/paste-*.ts`, `inline-content-limits.ts` (stubs).
- VS Code: `events/paste-classifier.ts`, `paste-reconciler.ts`, `paste-payload.ts`,
  `wiring/paste-command-intercept.ts`.
- Conformance: `tests/conformance/paste.test.ts` against `fixtures/paste-payload.json`.
- Blocked by decision 7: copy VS Code's pure helpers or share them through a package. Ask
  before starting.

**6.4 External changes on disk.** Changes made outside the editor (a terminal, `!cmd`, `%load`)
become `fs.external_change`.
- Server: `provjup/watch/fs_watcher.py` (stub) with `watchdog`, plus a slow polling safety net
  (decision 14). Adding `watchdog` needs dependency approval first.
- Frontend: `src/recorder/watch/*`, `src/recorder/state/expected-content*.ts`,
  `src/recorder/events/external-change-*.ts`, `explanation-tags.ts` (stubs).
- VS Code: `wiring/fs-watcher.ts`, `events/external-change-detector.ts`, `state/`.
- **Open design question:** how the server tells the browser about a change (polling a route, or
  JupyterLab's event stream). Propose before building.
- Easy to get wrong: the expected-content model is the source of truth, and the on-disk hash is
  what you compare against. For notebooks, compare views, so output-only changes emit nothing.
- Conformance: `fixtures/external-change-content.json`. Measure notification speed on a Data 100
  server.

**6.5 Check DataHub idle shutdown.** DataHub shuts down a server after 30 minutes without
activity. Check whether the recorder's own requests count as activity and keep abandoned tabs
alive. If they do, mark the routes in `provjup/api/` as not tracking activity.

### Task 7: Integrity

**7.1 `.slog.meta` and atomic writes.** Persist the session's private key, encrypted under a key
derived from the manifest signature, so a reloaded page can keep signing.
- Files: `src/recorder/io/meta-writer.ts`, `atomic-write.ts`, `provjup/fs/atomic_write.py`,
  `provjup/api/files.py` (route) (stubs or partly done).
- VS Code: `io/meta-writer.ts`, `io/atomic-write.ts`.
- **Keep temporary files outside `.provenance/`,** on the same disk. Otter zips `.provenance/`
  and fails if a file it listed disappears mid-export.

**7.2 Signed checkpoints.** A signed checkpoint every 100 entries, off the keystroke path.
- Files: `src/recorder/session/checkpoint-cadence.ts`, `checkpoint-scheduler.ts` (stubs).
- VS Code: the checkpoint logic in `session/session-registry.ts`. Conformance:
  `fixtures/checkpoint.json`.

**7.3 Chain recovery after a reload.** On start, find this recorder's previous session in
`.provenance/`, set `prev_session_id`, and quarantine a log that does not validate.
- Files: `src/recorder/startup/chain-recovery.ts`, `slog-ownership.ts` (stubs).
- VS Code: `startup/chain-recovery.ts`, `startup/slog-ownership.ts`.

**7.4 Rolling seal and `extension_hash`.** Rewrite `manifest-<session>.json` and `.sig` at
start, at each checkpoint, on save and at the end. This is the only seal: there is no Prepare
Submission Bundle command.
- Files: `src/recorder/io/rolling-seal-writer.ts`, `src/recorder/commands/extension-hash.ts`,
  `provjup/extension/extension_hash.py` (stubs).
- VS Code: `io/rolling-seal-writer.ts`, `io/rolling-seal-scheduler.ts`,
  `commands/extension-hash.ts`. Conformance: `fixtures/rolling-manifest.json`.
- `extension_hash` is blocked by monorepo request 3: there are no test vectors for it, and the
  recorders sort paths differently. Use byte-order sorting, and wait for vectors before relying
  on it.

**7.5 Save, flush and seal on every cell run.** On `NotebookActions.executionScheduled`, save
the notebook if it has unsaved changes, flush the log and roll the seal, so Otter's export sees
current files. Test the race with Otter's export cell.

**7.6 One writer per session across tabs.** Two tabs on the same server currently start two
sessions. `src/recorder/session/tab-ownership.ts` (stub). Design not decided; propose first,
for example a `BroadcastChannel` lock.

**7.7 Degraded mode and status item.** Report a failed disk or write without stopping recording,
and show a "Provenance: recording" status item.
- Files: `src/recorder/failure/*`, `src/recorder/activation/status-bar.ts`, `recorder-state.ts`
  (stubs). Needs `@jupyterlab/statusbar` (dependency approval) and decision B5 on `style/`.
- VS Code: `failure/disk-full-handler.ts`, `activation/status-bar.ts`.

**7.8 Remove the seal-command stubs.** Delete `src/recorder/commands/seal.ts`,
`seal-selector.ts`, `bundle-orphan-guard.ts`, `provjup/api/seal.py` and their test stubs. There
is no Prepare Submission Bundle by decision.

### Task 8: More signals and identity

**8.1 Terminal commands.** `terminal.open` and `terminal.command` from JupyterLab terminals.
`src/recorder/wiring/terminal-wiring.ts`, `events/terminal-payloads.ts` (stubs).
VS Code: `wiring/terminal-wiring.ts`.

**8.2 Git events.** The server reports raw git facts; the frontend builds `git.event`. Missing
git is a degraded signal, never a crash. `provjup/git/probe.py`,
`src/recorder/wiring/git-wiring.ts`, `root-commit-sha.ts`, `events/git-payloads.ts`,
`io/git-attributes-writer.ts` (stubs). VS Code: `wiring/git-wiring.ts`. Conformance:
`fixtures/git-event.json`.

**8.3 Peer witnessing.** Watch `.provenance/` for a partner's log and record `peer.observed`.
`src/recorder/watch/peer-watcher.ts`, `events/peer-payload.ts` (stubs). VS Code:
`wiring/peer-watcher.ts`. Conformance: `fixtures/peer-observed.json`.

**8.4 Identity and enrollment.** Students enroll once, as in VS Code: sign in with Google at
`/enroll` and paste the token back. The master secret is a `0600` file in the Jupyter data
directory, in the home directory, outside every assignment folder.
- Files: `provjup/identity/store.py`, `src/recorder/identity/*`,
  `src/recorder/commands/enrollment.ts` (stubs).
- VS Code: `identity/session-identity.ts`, `commands/enrollment.ts`, `activation/enroll-nudge.ts`.
  Do not port the back-up and restore commands.
- Never write the secret to a workspace, `.provenance/`, a log or browser storage. Refuse to
  activate if an assignment folder contains the identity file.
- Conformance: `fixtures/enrollment.json`, `identity.json`, `student-keys.json`.

**8.5 Extension snapshot and activation events.** `ext.snapshot` and `ext.activate` from
JupyterLab's installed extensions. `src/recorder/wiring/snapshot-wiring.ts`,
`ext-activation-wiring.ts`, `provjup/extension/inventory.py` (stubs). VS Code:
`wiring/extension-snapshot.ts`, `wiring/extension-activation.ts`.

### Task 9: Real-world testing and release

**9.1 End-to-end test in real JupyterLab.** `scripts/e2e/run_e2e.sh` and `ui-tests/`
(Playwright with Galata needs dependency approval). Produce a real two-session bundle and pass it
through `scripts/verify-bundle-with-analyzer.mjs`. The Task 4 log describes a manual version of
this check.

**9.2 Test on JupyterLab 4.4.5.** Data 101 and 102 run 4.4.5; everything so far was checked on
4.5.0. Build, install and run the Task 4 check on 4.4.5.

**9.3 Otter to Gradescope to `provgate`.** Export a real assignment with
`grader.export(files=[".provenance"])` while recording, submit it to Gradescope, sync it with
`provgate`, and confirm the bundle ingests. See "Otter findings" in the plan.

**9.4 Course images.** Get `provjup` into the Data 100 image, then 101 and 102, and run a real
assignment end to end. Waits on DataHub support's answers.

**9.5 Local Jupyter demo.** A signed sample assignment and short instructions for
`pip install provjup` on a laptop. Checked on one OS and one JupyterLab version.

**9.6 Guides.** Student, staff, JupyterHub and release guides in `docs/`, written from what was
built. The staff guide must cover: provisional seals, staff access to the identity file, the
`.provenance` placeholder and `files:` entries for Otter Assign.

### Task 10: Cell runs (on hold)

A `cell.execute` event and a cell view in the analyzer. Waits on decisions 1 and 10 and on
monorepo approval, because it changes the log format. Do not start.

## Not code: outreach

These are for the project owner, but anyone can help draft them.

| Item | Status |
| --- | --- |
| Send [`monorepo-owner-requests.md`](monorepo-owner-requests.md); also ask about B7 (`'jupyterlab'` in `HostInfo.editor`) | Not sent |
| Email Data 100 at `data100.instructors@berkeley.edu` (questions in `project-status.md`) | Not sent |
| Find contacts for Data 101 and 102 | Not started |
| Ask DataHub support: course images, whether `~/.local/share/jupyter` persists, staff role scope | Not sent |
| Merge PRs #2 to #6 | Waiting on review |

## Open issues and decisions

| # | Issue | Who decides |
| --- | --- | --- |
| B1 | Approve the notebook `view` field and format | Monorepo owner |
| B2 | Text-view edge cases: notebooks before format 4.5, `\r\n` | Monorepo owner, then project owner |
| B3 / Decision 7 | Copy VS Code helpers or share them | Project owner |
| B4 | Confirm the build dependencies already added | Project owner |
| B5 | Wire up `style/` or delete it | Project owner |
| B7 | Land `'jupyterlab'` in `HostInfo.editor` | Monorepo owner |
| Decision 6 | Real-time collaboration: require it off for v1? | Project owner |
| Decisions 1, 10 | Record cell runs and output details? | Project owner, then monorepo owner |
| — | `NOTICE` copyright holder | Project owner |
