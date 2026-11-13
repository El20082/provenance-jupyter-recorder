# Project status: provjup

Updated 2026-11-13. This page summarizes where the JupyterLab recorder stands. Details live in:

- [`plans/2026-10-30-plan.md`](plans/2026-10-30-plan.md): the full plan and task breakdown
- [`plans/2026-11-13-log-core-fix-and-build.md`](plans/2026-11-13-log-core-fix-and-build.md): the step-by-step log of the latest work
- [`monorepo-owner-requests.md`](monorepo-owner-requests.md): requests waiting on the monorepo owner

## Where things stand

In JupyterLab 4.5.0, the version Data 100 runs, the extension finds verified assignment
folders, starts a session for each, and writes a hash-chained log with `session.start` and
`session.end`. **Edits are not recorded yet:** the notebook and editor signals are wired in
Tasks 5 and 6.

| Area | State |
| --- | --- |
| Build and install | Working: `npm install`, `npm test`, `pip install -e .` |
| `log-core` | Git submodule at monorepo commit `fe3a290`, built locally |
| Session host | Ported from VS Code; every entry hash-chained |
| Notebook text view and deltas | Implemented and tested; keystroke p99 0.34 ms on a 2 MB notebook |
| Tests | 84 TypeScript and 32 Python passing; 77 to-do stubs |
| Activation and session logs | Working in real JupyterLab (Task 4) |
| Recording edits | Not started (Tasks 5 and 6) |

## Progress

| Date | What happened |
| --- | --- |
| 2026-10-30 | Copied shared files from the sibling repos: brand assets and conformance vectors. Merged as PR #1 |
| 2026-10-30 | Wrote the project plan, reviewed the Otter guide against Otter's source, and researched DataHub courses |
| 2026-10-30 | Lillian connected `log-core` and added an activity recorder. The review found the output was not a valid Provenance log |
| 2026-10-30 | Wrote the requests for the monorepo owner (not yet sent) |
| 2026-11-13 | Fixed Lillian's integration and completed the real build (Task 3). Opened as PRs #2 to #5 |
| 2026-11-13 | Completed Task 4: activation, session start and log writing, checked in real JupyterLab. PR #6 |

### Open pull requests

Merge in order. Each targets the one before it; avoid squash or rebase merges.

| PR | Contents |
| --- | --- |
| [#2](https://github.com/El20082/provenance-jupyter-recorder/pull/2) | Shared ignore rules and the analyzer gate script |
| [#3](https://github.com/El20082/provenance-jupyter-recorder/pull/3) | Vitest, ESLint, Prettier and the `log-core` build |
| [#4](https://github.com/El20082/provenance-jupyter-recorder/pull/4) | Fixes to the `log-core` integration |
| [#5](https://github.com/El20082/provenance-jupyter-recorder/pull/5) | The real JupyterLab build |
| [#6](https://github.com/El20082/provenance-jupyter-recorder/pull/6) | Task 4: activation, session start and log writing |

## Tasks

| Task | Work | Status |
| --- | --- | --- |
| 1 | Record decisions | In progress: decisions 6, 7, 1 and 10 remain |
| 2 | Monorepo changes: `jupyterlab` editor value, notebook format, hash vectors, check 8, key-management wording | Waiting on the monorepo owner |
| 3 | Real build | **Done**, in PRs #2 to #5; blockers B4 to B6 remain |
| 4 | Activation, session lifecycle, log writing through the server | **Done**, in PR #6 |
| 5 | Text files, then the notebook view | Text files ready; notebooks need B1 and B2 before students use them |
| 6 | Paste, external changes (`watchdog`), focus, heartbeats | After Task 5 |
| 7 | Checkpoints, recovery, rolling seal, auto-save on cell run | After Task 6 |
| 8 | Terminal, git, peer witnessing, identity, enrollment | After Task 7 |
| 9 | Real tests in Data 100, 101 and 102; release; guides; local demo | After Task 8, with check 8 deployed |
| 10 | Cell runs (`cell.execute`) with an output digest, shown in the analyzer | Decided; waits on monorepo approval (request 6) |

### Outreach and setup

- [ ] Merge PRs #2 to #5.
- [ ] Send [`monorepo-owner-requests.md`](monorepo-owner-requests.md) to the monorepo owner.
- [ ] Email Data 100 at `data100.instructors@berkeley.edu`.
- [ ] Find contacts for Data 101 and Data 102.
- [ ] Ask DataHub support the questions below.

## Blockers

| # | Blocker | Who | Effect until resolved |
| --- | --- | --- | --- |
| B1 | Approve the `view` field and the `ipynb-source-v1` format | Monorepo owner | The analyzer treats a notebook as a plain file; not usable by students |
| B2 | Settle text-view edge cases: notebooks before format 4.5, `\r\n` in cells, cell-boundary lookalike lines | Monorepo owner, then you | Notebooks without cell ids are not recorded at all |
| B3 | Decision 7: shared VS Code helpers | You | **Resolved 2026-11-13 (option D):** imported from the submodule like log-core (#52) |
| B4 | Confirm the JupyterLab packages added for the build | You | **Resolved 2026-11-13:** all confirmed (`application`, `builder`, `services`, `coreutils`, `notebook`, `fileeditor`, and the Python build tools) |
| B5 | `style/` | You | **Resolved 2026-11-13:** `style/`, the unused settings schema and `ui-tests/` removed (#53) |
| B6 | Approve Python dev tools: `pytest`, `ruff`, `mypy` | You | **Resolved 2026-11-13** |
| B7 | Land the approved `'jupyterlab'` value in log-core's `HostInfo.editor` | Monorepo owner | `session.start` uses the older `vscode` block; the analyzer cannot tell a JupyterLab session from a VS Code one |

## Decisions

### Made

| # | Decision |
| --- | --- |
| 2 | DataHub first, piloted on Data 100, then Data 101 and Data 102. Local Jupyter is a v1 demo |
| 3 | The master secret stays in the student's home directory, as a `0600` file outside every assignment folder |
| 4 | Submissions go through Otter's zip to Gradescope, then `provgate` to Provenance. No Prepare Submission Bundle |
| 8 | `log-core` comes in as a git submodule of the monorepo |
| 11 | Enrollment works as in VS Code: the student signs in with Google at `/enroll` and pastes the token back |
| 12 | Data 100 is the first pilot |
| 13 | Vitest, ESLint and Prettier |
| 14 | `watchdog` for file watching, with a slow polling safety net |
| 17 | The server reports disk changes through Jupyter Server's event stream, not polling |
| 16 | Approved dependencies: `watchdog`, `@jupyterlab/statusbar`, `@jupyterlab/apputils` (#54) |
| 7 | The VS Code recorder's pure helpers are imported from the submodule like log-core, never copied |
| 6 | Real-time collaboration must be off for v1; the recorder refuses to record while it is on (#51). Group work is a separate future project, highlighted in `docs/team-tasks.md` |
| 15 | The analyzer shows replayed notebooks with JupyterLab's own notebook components, embedded in its replay view the way Monaco is |
| 1, 10 | Record each cell run as a new `cell.execute` event, with a digest of its outputs, never their content |
| — | Students install, enroll once, and create the Otter zip. Nothing else |
| — | Contributor tracking is required |
| — | Every cell run auto-saves the notebook; every heartbeat is logged |
| — | Record with maximum granularity: letter by letter, with no avoidable delay |
| — | The VS Code recorder is the main reference |
| — | Provisional rolling seals are accepted for Otter submissions |

### Open

| # | Decision | Recommendation |
| --- | --- | --- |
| **18** | **Several browser tabs on one assignment: needs the project lead** | One tab owns the session, the others forward their events to it. See "Several tabs" in `docs/team-tasks.md` (#32) |
| 9 | Honeypot matching | After v1 |
| 5 | Fix VS Code's own notebook gap | Separate work; blocks nothing here |
| — | `NOTICE` copyright holder | Your call |

## Questions

### For Data 100, 101 and 102 staff

1. Do students submit Otter zips to Gradescope?
2. Data 100 only: does Pensieve handle any submissions? Its image includes `otter-pensieve`.
3. Is group work allowed?
4. Teachers and TAs can open student servers, so they could read a student's identity file. Is that acceptable?
5. Can `provjup` be added to the course image?
6. Data 101 only: how much work happens in notebooks?

### For DataHub support

1. How does a package get into a course image?
2. Does `~/.local/share/jupyter` persist between servers?
3. What exactly can the course-staff role access?
4. Can `watchdog` be added to the course images? `provjup` installs it.

### For the monorepo owner

The four requests in [`monorepo-owner-requests.md`](monorepo-owner-requests.md):
notebook format additions, text-view edge cases, `extension_hash` vectors, and the secret rule
wording. The owner also needs to say how a `provjup` release hash reaches the allowlist.

### Not yet verified

- The extension on JupyterLab 4.4.5, which Data 101 and 102 run.
- More than one browser tab on the same notebook: each tab starts its own session until Task 7.
- That JupyterLab reports cell edits in the format the notebook code expects. Checked in Task 4.
- A real Otter export reaching Gradescope with `.provenance/` intact.
- `watchdog` notification speed on DataHub's NFS home directories. Checked in Task 6.
- Heartbeats in hidden browser tabs, and whether they keep idle servers alive. Checked in Task 6.
