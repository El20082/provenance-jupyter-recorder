# Open tasks for the team

Updated 2026-11-13. This is the list of work anyone on the team can pick up, with enough context
to start. For the full plan see [`plans/2026-10-30-plan.md`](plans/2026-10-30-plan.md); for where
things stand see [`project-status.md`](project-status.md).

> [!IMPORTANT]
> **Task 2, the analyzer and monorepo changes, is a separate big task and must not be missed.**
> The analyzer cannot read JupyterLab recordings correctly until it is done. In particular,
> **check 8 must be deployed before any student uses the recorder**, or the analyzer will
> report false "edited outside the recording" mismatches against real students. This work
> happens in the `provenance` monorepo, not here, and most of it needs the monorepo owner's
> approval first. See [Task 2](#task-2-analyzer-and-monorepo-changes).

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

**Every task has a GitHub issue,** linked in the Issue column below. **To claim a task,** assign
yourself on its issue. Issues start unassigned. Discuss the work and link your pull request there.

## Task list

Sizes: **S** is under a day, **M** is a few days, **L** is a week or more.

| ID | Task | Size | Depends on | Blocked by | Issue |
| --- | --- | --- | --- | --- | --- |
| **2** | **Analyzer and monorepo changes: a separate big task, see below** | **L** | — | **Monorepo owner** | #10 |
| 5.1 | Route paths to sessions | S | — | — | — (done in the Task 5 PR) |
| 5.2 | Connect notebook edits to the recorder | M | 5.1 | — | — (done in the Task 5 PR) |
| 5.3 | Record plain text files | M | 5.1 | — | — (done in the Task 5 PR) |
| 6.1 | Heartbeats that survive hidden tabs | M | — | — | #22 |
| 6.2 | Focus and selection events | S | 5.2, 5.3 | — | #23 |
| 6.3 | Paste detection | L | 5.2, 5.3 | Decision 7 | #24 |
| 6.4 | External changes on disk | L | 5.2 | Dependency approval (`watchdog`) | #25 |
| 6.5 | Check DataHub idle shutdown | S | — | — | #26 |
| 7.1 | `.slog.meta` and atomic writes | M | — | — | #27 |
| 7.2 | Signed checkpoints | M | 7.1 | — | #28 |
| 7.3 | Chain recovery after a reload | M | 7.1 | — | #29 |
| 7.4 | Rolling seal and `extension_hash` | L | 7.2 | Monorepo request 3 | #30 |
| 7.5 | Save, flush and seal on every cell run | S | 5.2, 7.4 | — | #31 |
| 7.6 | One writer per session across tabs | M | — | Design not decided | #32 |
| 7.7 | Degraded mode and status item | M | — | B5 | #33 |
| 7.8 | Remove the seal-command stubs | S | — | — | #34 |
| 8.1 | Terminal commands | M | 5.1 | — | #35 |
| 8.2 | Git events | M | 5.1 | — | #36 |
| 8.3 | Peer witnessing | M | 6.4 | — | #37 |
| 8.4 | Identity and enrollment | L | 7.1 | Monorepo request 4 (wording) | #38 |
| 8.5 | Extension snapshot and activation events | S | — | — | #39 |
| 9.1 | End-to-end test in real JupyterLab | M | 7.4 | Dependency approval (Galata) | #40 |
| 9.2 | Test on JupyterLab 4.4.5 | S | — | — | #41 |
| 9.3 | Otter to Gradescope to `provgate` run | M | 7.4 | Course contact | #42 |
| 9.4 | Data 100 image, then 101 and 102 | M | 9.1 | DataHub support answers | #43 |
| 9.5 | Local Jupyter demo | S | 7.4 | — | #44 |
| 9.6 | Guides: student, staff, hub, releasing | M | 9.3 | — | #45 |
| 10 | Cell runs (`cell.execute`) with an output digest (decided) | L | 5.2, 2.7 | Monorepo approval (request 6) | #46 |

Outreach that is not code is at the end.

## Task 2: Analyzer and monorepo changes

> [!IMPORTANT]
> **A separate big task.** Everything here changes the `provenance` monorepo
> (`ProvenanceTools/provenance`): `log-core`, `analysis-core`, the analyzer UI or monorepo docs.
> Follow the **monorepo's** `CLAUDE.md`, not this repo's, and open the pull requests there.
> Format changes need the monorepo owner's explicit approval and a version bump. The monorepo
> also requires the `/architecture` page to be updated in the same pull request as any change
> to the format, a validation check, or a recorder.
>
> The requests waiting on the owner are in [`monorepo-owner-requests.md`](monorepo-owner-requests.md).

| ID | Change | Where in the monorepo | Size | Depends on | Blocked by | Issue |
| --- | --- | --- | --- | --- | --- | --- |
| 2.1 | Add `'jupyterlab'` to `HostInfo.editor` | `packages/log-core/src/events.ts` | S | — | Already approved; just not done (B7) | #11 |
| 2.2 | `view` field on `DocOpenPayload`, `ipynb-source-v1` projection, test vectors | `packages/log-core` | M | — | Request 1 and edge cases, request 2 (B1, B2) | #12 |
| 2.3 | View hash per `.ipynb` in the signed bundle manifest | `packages/log-core` | M | 2.2 | Request 1 | #13 |
| 2.4 | **Check 8 compares view hashes for notebooks. Deploy before any student uses the recorder** | `packages/analysis-core/src/validation/verify-submitted-code.ts` | M | 2.2, 2.3 | Request 1 | #14 |
| 2.5 | Export vectors for the text view and `extension_hash`; decide how a `provjup` release hash reaches the allowlist | `tools/export-conformance-vectors.ts`, `scripts/update-extension-hash-allowlist.mjs` | M | 2.2 | Request 3 | #15 |
| 2.6 | Treat `nbgitpuller` updates like git when explaining external changes | `packages/analysis-core/src/index/classify-external-changes.ts` | M | — | Owner agreement | #16 |
| 2.7 | **JupyterLab-based notebook viewer in replay** (decided 2026-11-13) | `packages/analyzer/src/views/replay/` | L | 2.2 | Owner agreement (new UI dependencies) | #17 |
| 2.8 | Add each `provjup` release's hash to the allowlist | `packages/analysis-core/src/heuristics/config/known-good-extension-hashes.json` | S | 2.5, a release | — | #18 |
| 2.9 | `/architecture`: add the JupyterLab recorder to the ecosystem and roadmap diagrams | `tools/architecture/dot/`, `packages/analyzer/src/views/architecture/content/nodes/` | M | — | Owner agreement | #19 |
| 2.10 | Allow the home-directory secret rule for browser-hosted recorders | `docs/key-management.md` §4.4 and §9 | S | — | Request 4 | #20 |
| 2.11 | `honeypot_similarity` heuristic and staff-only honeypot storage | `analysis-core`, `analyzer` or `server` | L | — | Decision 9; after v1 | #21 |

**Details:**

- **2.1** is the smallest and unblocks a correct `session.start`: once it lands, `provjup`
  switches from the older `vscode` block to `host.editor: 'jupyterlab'`
  (`src/recorder/session/recorder-context.ts`).
- **2.2** pins the projection in `log-core` with vectors, replacing this repo's draft in
  `src/notebook/text-view.ts`. Settle the edge cases in request 2 first: notebooks before
  nbformat 4.5, lines that look like cell boundaries, and `
`.
- **2.4 is the critical one.** Students submit the `.ipynb` with outputs, whose bytes never
  match the recording. Check 8 must compare the view hash for `view`-tagged paths instead. Old
  analyzers without this change would flag every notebook submission, so it ships first.
- **2.5:** `update-hashes` sorts paths with `localeCompare`, while `provjup` will use byte order.
  The owner decides how a `provjup` hash is computed and added.
- **2.6:** DataHub distributes assignments with `nbgitpuller`; its updates should be explained,
  not flagged.
- **2.7, decided 2026-11-13:** the analyzer shows replayed notebooks with JupyterLab's own open-source notebook components, embedded in its replay view the way Monaco is embedded today
  (`packages/analyzer/src/views/replay/MonacoMount.tsx`, lazy-loaded as its own chunk). Notebooks
  then look in the analyzer as they did to the student. JupyterLab's packages are BSD-3-Clause.
  Suggested steps:
  1. **Spike first:** mount a read-only JupyterLab notebook (Lumino widgets inside React) behind
     `React.lazy`, measure bundle size and load time, list the exact `@jupyterlab/*` packages,
     and report back before building further.
  2. **Model from the view:** turn the replayed view into cells with log-core's view parser
     (2.2), and update the notebook model incrementally as `doc.change` events apply.
  3. **Read-only rendering:** highlighted code cells and rendered Markdown. No kernel, no
     editing, no outputs, which are not recorded.
  4. **Port the replay overlays** now on Monaco (gutter decorations, line hover, cursor marker,
     contributor ribbons) onto each cell's CodeMirror editor, using the parser's mapping from
     view line to cell and line.
  5. **Keep Monaco for every other file type;** only `view`-tagged `.ipynb` paths use the viewer.

  Needs the monorepo owner's approval for the new analyzer dependencies, their license notices
  and the bundle size. It was part of Task 10, but notebook replay needs it either way.
- **2.2 now includes the view's parser,** the inverse of the projection, so the analyzer and the
  recorder agree on where cells start. This makes the look-alike header edge case (request 2)
  matter for correctness, not only display: a cell containing a line like `# %% [code] id=…`
  would otherwise be split in two by the viewer.
- **2.9** is required by the monorepo's `CLAUDE.md` for any new recorder.

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

### Task 10: Cell runs

**Decided 2026-11-13** with the project lead: record each cell run as a new `cell.execute` event, with a **digest** of its outputs (hashes, sizes and output types), never the output content. The analyzer shows runs and whether their results changed.

- **Recorder:** one `cell.execute` per cell run, from `NotebookActions.executionScheduled` and
  `executed`, emitted through `session-host.ts`. Hash the outputs when the run ends, never on
  the keystroke path. Files: `src/recorder/wiring/notebook-wiring.ts`, `src/recorder/events/`.
- **Analyzer:** run markers in the JupyterLab notebook viewer (2.7): when each cell ran, whether
  it failed, and whether its outputs changed since the last run.
- **Blocked by** the monorepo owner: `cell.execute` is a format change. The draft payload is
  request 6 in [`monorepo-owner-requests.md`](monorepo-owner-requests.md). Do not merge
  recorder code that emits it before log-core has it.

## Not code: outreach

These are for the project owner, but anyone can help draft them.

| Item | Status |
| --- | --- |
| Send [`monorepo-owner-requests.md`](monorepo-owner-requests.md); also ask about B7 (`'jupyterlab'` in `HostInfo.editor`) and Task 2 as a whole | Not sent |
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
| — | `NOTICE` copyright holder | Project owner |
