# Design: Provenance JupyterLab Recorder (`provjup`)

Draft. The VS Code recorder (`packages/recorder`) is the main reference for building
this repo; `provnvim` and `provjet` are consulted only where it has no equivalent. Sections
follow `docs/design.md` in `provnvim` and `provjet`. Items marked
**open** need a decision before implementation.

## 1. What this is

A JupyterLab extension that records a tamper-evident Provenance log and seals a bundle
the existing analyzer accepts. Like the other recorders, it is a port of the wiring, not
a new product. Unlike them, it does not port the format: it imports `log-core`.

## 2. Scope

In: notebooks and text files in JupyterLab and Notebook 7, activated by a verified
manifest.

Out: cell outputs, execution history, VS Code notebooks, Colab.

**Deployment:** Berkeley DataHub first, piloted on Data 100, then Data 101 and Data 102, with `provjup` in the
course image. Local Jupyter is a v1 demo, not full support.

**Student workflow:** students install the extension, enroll once, and create the zip with
Otter. There is no Prepare Submission Bundle command; the rolling seal travels in
`.provenance/` inside Otter's zip.

## 3. The runtime strategy

The frontend (TypeScript, browser) does all recording and all format work. The server
extension (Python) moves bytes, because a browser cannot write files, watch a disk or
read the installed extension tree.

Signing stays off the keystroke path, as in `provnvim`.

## 4. The format-parity strategy

| Recorder | Format layer |
|---|---|
| VS Code | Imports `log-core` |
| `provjet` | Kotlin port in `core/`, gated by conformance vectors |
| `provnvim` | Lua port in `lua/provenance/core/`, gated by conformance vectors |
| `provjup` | Imports `log-core` through `src/core/`; no port |

`extension_hash` is the only format algorithm in Python, and it is gated by the vectors.

Notebooks use the `ipynb-source-v1` text view defined in the README.

## 5. The wiring map

| Signal | `provnvim` | `provjet` | `provjup` |
|---|---|---|---|
| Edits | `on_lines` | Document listeners | `ISharedCell.changed`, source delta |
| Paste | `vim.paste()`, edit burst, registers | Paste handler, burst, clipboard | CodeMirror/DOM paste, edit burst, reconciler |
| External change | `FileChangedShell`, `:checktime`, `uv` watcher | VFS refresh on focus | Server watcher, reload and save-time checks |
| Terminal | Terminal autocmds | Terminal plugin | JupyterLab terminals |
| Git | `git` CLI probe | Git4Idea | Server probe reports raw facts |
| Secrets | `0600` file in `stdpath("data")` | PasswordSafe | `0600` file in the Jupyter data directory (§12) |
| Peer witnessing | `uv` watcher on `.provenance/` | VFS listener | Server watcher on `.provenance/` |

Jupyter-specific risks: edits from real-time collaborators, the same notebook in two
tabs, hub idle shutdown, and `%load` or `!cmd` changing files.

## 6. Producer identity

`session.start.recorder.extension_id` is this extension's id, and
`session.start.host.editor` is `'jupyterlab'`.

There is no 1.x manifest history, so this recorder has no legacy course key.

## 7. Distribution

One pip package carries the prebuilt frontend and server extension. On a hub, staff
install it in the image. `extension_hash` covers the installed labextension tree.

## 8. Changes required in the Provenance monorepo

See "Required monorepo changes" in the README. Unlike `provnvim` and `provjet`, this
recorder needs format additions, which require approval and must ship analyzer-first.

## 9. Build sequence

1. Approve the monorepo format additions; add `log-core` delivery.
2. Activation, session host, writer through the server extension.
3. Text files, then the notebook text view.
4. Paste, external-change detection, heartbeat, focus.
5. Checkpoints, recovery, degraded mode, rolling seal, seal.
6. Terminal, git, snapshots, peer witnessing, identity.
7. Analyzer gate, release build, allowlist entry.

## 10. Why a separate repo

It has its own runtime, packaging and release cycle, as `provjet` and `provnvim` do.

## 11. Testing

- **Conformance:** `tests/conformance/`, vectors from `make vectors`.
- **Unit:** `tests/` mirrors `src/`; `tests/server/` mirrors `provjup/`. Mock at the seam.
- **Gates:** `tests/gates/` and `scripts/verify-bundle-with-analyzer.mjs`. A recorder is
  conformant when a bundle it really produced passes the real loader and checks.
- **Manual:** `docs/manual-verification.md`.

## 12. Open questions

See "Open decisions" in the README.

Secret storage is decided. The master secret stays in the student's home directory at rest,
in a `0600` file in the Jupyter data directory, because a hub has no OS vault. This replaces
"never leaves the student's machine" from monorepo key-management §4.4 for `provjup`, and
the file must stay outside every assignment folder.
