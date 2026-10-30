# CLAUDE.md

Conventions for this repo. The `provenance` monorepo's CLAUDE.md is the parent reference.
The approved design is `docs/design.md`; read it before implementing anything.

## What this is

`provjup`: a JupyterLab recorder producing bundles the Provenance analyzer accepts.
It is a port of the wiring, not a new product.

The point of the recorder is to recreate how a student worked, letter by letter. Prefer the
finest capture available, and never accept avoidable delay or merged events for simplicity.

**The VS Code recorder (`packages/recorder` in the monorepo) is the main reference.** Read
the matching VS Code module and its tests before building anything here, and keep its
behavior, naming and structure unless JupyterLab forces a difference. Consult `provjet`
and `provnvim` only where VS Code has no equivalent.

## The student workflow

Students install the extension in JupyterLab and create the zip with Otter at the end of
their session. The only other action is enrolling once, the same way as VS Code: the
student signs in at `/enroll` and pastes the token back. Contributor tracking requires it.
It never blocks recording, and one enrollment serves every course.

- **There is no Prepare Submission Bundle command, or any other Provenance seal step.** The
  rolling seal is the only seal. Do not port VS Code's seal command, even though VS Code is
  the main reference.
- Nothing else may need a student's action: no settings, seal step or extra upload.
  Recording and sealing happen automatically.
- Every cell run saves a dirty notebook, flushes the log and rolls the seal.
- Every heartbeat is logged, including while the tab is hidden.

## The format contract

- The format is owned by the monorepo's `log-core`. Import it through `src/core/`.
  Never re-implement it here.
- If the format appears to need a change, stop and ask. Format changes land in the
  monorepo first, with explicit approval.
- Conformance failures mean the code is wrong. Never edit a vector.
- Never modify `manifest.json` or `manifest.sig` after seal.

## Architecture rules

- `src/` records. `provjup/` moves bytes and never builds or interprets log entries.
  The exception is `extension_hash`, gated by conformance vectors.
- Every log entry goes through `session-host.ts`. Events are append-only.
- Never sign or canonicalize on the keystroke path. Target p99 under 1 ms.
- Identity failure never blocks recording.
- The master secret never leaves the student's home directory at rest: a `0600` file in
  the Jupyter data directory, replacing the other recorders' "never leaves the machine"
  rule. It never enters a workspace, `.provenance/`, a log, a bundle or browser storage.
  The browser holds it in memory only while deriving the student key.
- Honeypot answers never reach the recorder, the manifest or the bundle.

## Working agreement

- Stop and ask on ambiguity. See "Open decisions" in README.md.
- Stay in scope. If you notice something that should change, mention it; don't change it.
- No new dependencies without approval.
- No weakened tests without explaining why.
- Keep diffs small. Read a module and its tests before editing.
- Every background task has a dispose path.

## Testing

- `tests/` mirrors `src/`; `tests/server/` mirrors `provjup/`.
- Test event transforms as pure functions and mock at the seam.
- Inject clocks. Tests must be deterministic.
- New behavior gets tests; bug fixes get a regression test.

## Things that are easy to get wrong here

The format is the low-risk part. The wiring is where the real ambiguity lives, and
JupyterLab's semantics differ from VS Code's. Do not assume a 1:1 mapping.

- **External changes.** The expected-content model is the source of truth; the on-disk
  hash is what you compare against. Easy to get the direction wrong.
- **Paste detection.** Three signals, reconciled to exactly one event per paste. Do not
  simplify to one signal without discussion.
- **Git degrades gracefully.** Missing git is a degraded signal, not a crash.
- **Activation is scoped.** Record only inside a verified assignment root. Drop events
  for anything outside it.
- **Atomic writes.** Write-temp-then-rename. Never partial-write the live log file.
- **Clocks.** Monotonic for `t`, wall clock for `wall`, and format `wall` to fixed-width
  milliseconds. `provjet` shipped a bug where dropped millis broke the analyzer's
  monotonic-wall check.
- **The edit firehose.** Handlers stay fast and the writer buffers.

## Code style

- TypeScript strict mode. `unknown` over `any`; discriminated unions for event types.
- Python follows `pyproject.toml`: ruff and strict mypy.
- Pure functions over classes when there's no state to own.
- No `Promise.all` over operations that must be ordered. Log writes are ordered.
- Errors are values when expected, exceptions when unexpected. Never swallow.

## Conventions for talking to me

- When you finish a task, summarize what you did, what you didn't do, and what you
  noticed but didn't change.
- If you make a non-obvious choice, explain it in the response, not in a comment.
- If you used a dependency you weren't told to use, or skipped a test you couldn't get
  to pass, lead with it.
- "Done" means tests pass (including conformance), it builds, and the diff is reviewable.

## Git commits

- Conventional-commit prefixes (`feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `style`).
- Commit with `git commit --no-gpg-sign`. Do **not** add a `Co-Authored-By: Claude` trailer
  or any Claude attribution.
- Always stage and commit with an explicit pathspec.
- Commit incrementally during multi-phase work.

## When in doubt

Re-read `docs/design.md`, the recorder PRD section and this file, then ask. The format is
a contract owned elsewhere, and a clarifying question costs five minutes.
