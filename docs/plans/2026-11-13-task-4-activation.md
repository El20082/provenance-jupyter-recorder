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
