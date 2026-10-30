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
| A cell containing a line like `# %% [code] id=x` | It looks like a cell boundary, so the analyzer could display cells wrongly | Hashes are unaffected. Fix display only, by splitting on the exact pattern |
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

## Related, not requested yet

`cell.execute`, a proposed event for cell runs, would also be a format change. It waits on
this project's own decisions 1 and 10 and is not part of this request.

The other required monorepo changes are listed in `README.md` under "Required monorepo changes".
