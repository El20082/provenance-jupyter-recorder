# Requests for the monorepo owner

Status: not yet sent. Date written: 2026-10-30.

`provjup` is a JupyterLab recorder for Provenance, targeting Data 100, Data 101 and Data 102
on Berkeley DataHub. It imports `log-core` rather than porting it, so these changes must land
in the monorepo first. Items 1 to 3 block the notebook work. Item 4 should be agreed before
students use the recorder.

| # | Request | Type | Needed by |
| --- | --- | --- | --- |
| 1 | Notebook format additions | Format change | Tasks 3 to 5 |
| 2 | Text-view edge cases | Format decision | Before item 1 is finalized |
| 3 | `extension_hash` vectors | Test vectors | Task 7 |
| 4 | Secret rule wording | Security policy | Before student use |
| 5 | Analyzer notebook viewer built from JupyterLab | New analyzer dependencies | Before students' notebooks are reviewed |
| 6 | `cell.execute` event for cell runs, with an output digest | Format change | Task 10 |
| 7 | A shared package for the recorders' pure helpers | Refactor | Not urgent; `provjup` works without it |
| 8 | Honeypot detection in the analyzer | New heuristic and policy question | v1 |
| 9 | Each code cell's language in the log | Format change | Task 5.5; the viewer falls back to Python until then |

`HostInfo.editor` gaining `'jupyterlab'` is already approved and is not repeated here.

## 1. Notebook format additions

**Problem.** A `.ipynb` file's bytes change whenever a cell runs, because it stores outputs and
metadata. Comparing recorded edits with those bytes would make every notebook look edited
outside the recording.

**Proposal.** Record a plain-text view of the cell sources:

```text
# %% [code] id=a1b2c3
import numpy as np
# %% [markdown] id=d4e5f6
## Question 2
```

| Package | Change |
| --- | --- |
| `log-core` | Optional `view` field on `DocOpenPayload` |
| `log-core` | `ipynb-source-v1` projection function, with test vectors |
| `log-core` | View sha256 per `.ipynb` in the signed manifest |
| `analysis-core` | Check 8 compares view hashes for `view`-tagged paths |

No new event types are needed for this. The full draft definition is in this repo's `README.md`
under "Notebook text view".

**Ship order.** The check 8 change must deploy before any Jupyter recorder ships. Otherwise
older analyzers report false "edited outside the recording" mismatches against real students.

**Approval needed:** the three `log-core` changes and the projection definition.

## 2. Text-view edge cases

The view is hashed, so one different character changes the result. These need fixed answers
before the format is finalized.

| Case | Problem | Recommendation |
| --- | --- | --- |
| Notebooks older than format 4.5 | They have no cell ids, which the view requires | Require 4.5 or later for assignments; staff control this when creating them |
| A cell containing a line like `# %% [code] id=x` | It looks like a cell boundary. With the JupyterLab viewer (request 5), the analyzer would split that cell in two | Hashes are unaffected. The view parser must split only on headers whose id is a known cell id, or the projection must make headers unambiguous. Decide before the format is pinned |
| `\r\n` inside a cell | Line endings produce different hashes for the same text | Convert to `\n` inside the projection function |

**Approval needed:** the three answers above, or better ones.

## 3. `extension_hash` vectors

**Problem.** `extension_hash` is a fingerprint of the installed extension, computed by hashing
every file in sorted path order. `provjup` computes it in Python, the only format algorithm
outside `log-core`, and its docs say conformance vectors gate it. However,
`tools/export-conformance-vectors.ts` exports no such vectors.

The recorders also sort differently:

| Implementation | Sort |
| --- | --- |
| VS Code and `update-hashes` | `localeCompare` |
| `provjet` | Ordinal |
| `provnvim` | Byte order |

**Proposal.** Add `extension_hash` vectors that pin byte-order sorting for `provjup`, which is
the same on any machine. Leave the other recorders unchanged, because changing their sort
would change their released hashes.

**Approval needed:** adding the vectors, and how a `provjup` release hash reaches
`known-good-extension-hashes.json`, given that `update-hashes` uses `localeCompare`.

## 4. Secret rule wording

**Problem.** `docs/key-management.md` §4.4 says the student master secret lives only in the OS
credential vault and "never leaves the machine". DataHub runs in the browser and has no vault.
Contributor tracking is required, so the secret is still needed.

**Proposal.** Allow this rule for browser-hosted recorders:

- At rest, the secret never leaves the student's home directory. It is a `0600` file in a
  `0700` folder under the Jupyter data directory, outside every assignment folder.
- It never enters a workspace, `.provenance/`, a log, a bundle or browser storage.
- The browser holds it in memory only while deriving the student key, because all signing runs
  in the frontend.

Enrollment and key derivation are unchanged, so this is not a format change. Students enroll
with Google as they do in VS Code.

**Known weaknesses to accept:**

- Anything running as the student can read the file, including code in a notebook.
- Teachers and TAs have `access:servers` on the target courses, and admins can reach home
  directories, so they could read the file and sign as that student.

**Approval needed:** updated §4.4 and §9 wording, and acceptance of these weaknesses.

## 5. Analyzer notebook viewer built from JupyterLab

**Decided by the project owner (2026-11-13):** the analyzer shows replayed notebooks with
JupyterLab's own open-source notebook components (BSD-3-Clause), embedded in the replay view the
way Monaco is embedded today (`packages/analyzer/src/views/replay/MonacoMount.tsx`, lazy-loaded as
its own chunk). Notebooks then look in the analyzer as they did to the student.

**What this needs from the monorepo:**

- **New analyzer dependencies:** JupyterLab notebook, CodeMirror and rendermime packages, and
  Lumino, used as published npm packages with no fork. The exact list comes from a spike; they
  are lazy-loaded so only notebook replay pays for them. License notices are needed. The
  project owner has confirmed this approach; any fallback to Monaco-per-cell goes back to them.
- **A view parser in log-core,** the inverse of the `ipynb-source-v1` projection, with vectors, so
  the analyzer and the recorder agree on cell boundaries (request 1).
- **The replay overlays** (gutter decorations, line hover, cursor marker, contributor ribbons)
  ported from Monaco onto each cell's CodeMirror editor.

No format change is needed beyond request 1. Output content is not recorded, so the viewer shows
code and Markdown, plus run markers from `cell.execute` (request 6). It defaults to Python
highlighting because the view records no kernel language.

**Approval needed:** the new analyzer dependencies and their bundle size.

## 6. A `cell.execute` event for cell runs

**Decided by the project owner and project lead (2026-11-13):** record each cell run, with a
**digest** of its outputs, so the analyzer can show when a student ran code and whether the
results changed. Output content is never recorded: it can be large and can contain personal
data, and stored bundles keep no source files anyway.

**Why a new event.** `terminal.command` has a similar shape, but the `no_intermediate_errors`
heuristic reads it as shell commands; mixing cell runs in would change that flag's meaning.

**Draft payload** (names and shapes for the owner to finalize):

| Field | Meaning |
| --- | --- |
| `path` | The notebook, relative to the assignment root |
| `cell_id` | The cell that ran; matches its header in the `ipynb-source-v1` view |
| `source_sha256` | Hash of the cell's source when it ran, tying the run to the replayed view |
| `execution_count` | The kernel's run counter, or `null` |
| `started_t` | Monotonic ms when the run was scheduled; the envelope's `t` is when it ended |
| `status` | `ok`, `error`, or `aborted` (interrupted, kernel restarted, or never finished) |
| `error_name` | The exception name, such as `ZeroDivisionError`, on error only. Not the message, which can contain data |
| `outputs` | One digest per output: `output_type`, MIME types, byte size, and `sha256` of the output as nbformat JSON. Capped at a fixed number of entries, with a flag when capped |

One event per cell, so "run all" produces one per cell. Outputs are hashed when the run ends,
never on the keystroke path.

**Also possible later:** when a submission includes the `.ipynb`, ingest could compare its
outputs with each cell's last recorded digest, before the source files are stripped. A
mismatch would show outputs that no recorded run produced.

**Needs:** the event type and payload in log-core with vectors, analyzer support (run markers
in the notebook viewer, request 5), and an `/architecture` update.

**Open questions for the owner:** whether clearing outputs should be its own event, and the
cap on output entries per run.

## 7. A shared package for the recorders' pure helpers

**Decided here (2026-11-13, decision 7):** `provjup` imports the VS Code recorder's pure helpers
directly from the `vendor/provenance` submodule, the same way it imports log-core, instead of
copying them. These are `events/paste-classifier.ts`, `paste-payload.ts`,
`inline-content-limits.ts`, `external-change-content.ts`, `external-change-detector.ts`,
`explanation-tags.ts`, and `state/expected-content.ts` and `expected-content-registry.ts`.

**The risk:** these are internal files of `packages/recorder`, not a published API. Moving or
renaming them breaks `provjup`'s build on its next submodule update. The failure is loud, not
silent, so this is not urgent.

**Request:** move them into a shared package, for example `packages/recorder-core`, imported by
the VS Code recorder and by `provjup`. The JetBrains and Neovim recorders could check against it
too. Until then, please treat these files' paths and exports as used by `provjup`.

## 8. Honeypot detection in the analyzer

**Decided by the project owner (2026-11-13): in v1.** Staff define honeypot answers per
assignment, and a `honeypot_similarity` heuristic flags cells whose text matches one at any
recorded point or at submission. Evidence shown: honeypot id, cell id, match score, when the text
first appeared, how it arrived (typed, pasted, changed on disk) and whether it was still present
at submission. A hit is a prompt for human review, never a finding on its own.

**What it needs:** the heuristic in `analysis-core`, registered in `known-flag-ids.ts`, with a
tuning-UI entry and heuristic docs; staff-only storage and editing of honeypot answers in the
analyzer or server; and an `/architecture` update. No log format change: honeypot answers never
reach the recorder, the manifest or the bundle.

**Questions for the owner and the project lead:**

1. What counts as a match: exact, whitespace-normalized, or fuzzy, and at what threshold?
2. What is a honeypot: a planted wrong answer, a fake source, or a trap instruction?
3. Does comparing student text fit recorder PRD NG5, which rules out judging the code itself?
   Provenance reasons about how work was produced, not about the code.

## 9. Each code cell's language in the log

**Decided by the project owner (2026-11-13, decision 19):** the log records the language of
each code cell. The analyzer's notebook viewer (request 5) needs it to highlight code, and
Provenance should work beyond Python courses: R, Julia, SQL and others. The `ipynb-source-v1`
view (request 1) keeps cell types, ids and sources, but drops the notebook metadata that holds
the language.

**Where the language comes from in JupyterLab:**

- The notebook's language: `metadata.language_info.name`, falling back to
  `metadata.kernelspec.language`. It changes when the student switches kernels.
- Per-cell overrides: a cell magic on a cell's first line (`%%R`, `%%bash`, `%%sql`). The first
  line is already in the log as part of the source.
- Markdown and raw cells have no language.

**Requirement:** at every point in the log, each code cell's language can be recovered,
including after a kernel change.

**Possible shapes, for the owner to choose:**

| Shape | How | Trade-off |
| --- | --- | --- |
| A. Notebook language plus changes | `language` in the notebook's `doc.open` payload, and an event when it changes. The analyzer applies cell magics from the source | Small. One field per notebook; magics are derived, not stored |
| B. In the text view | Each header line carries it: `# %% [code] id=a1b2c3 lang=python` | Every cell explicit, but a kernel change rewrites every header, and request 1 changes |

**Decided by the project owner (2026-11-13): A.** The exact field and event names are yours.
Either way the viewer falls back to Python for logs recorded before this lands.

**Needs:** the field or event in log-core with vectors, analyzer support in the viewer
(request 5), and an `/architecture` update.

## Related, not requested yet

The other required monorepo changes are listed in `README.md` under "Required monorepo changes".
