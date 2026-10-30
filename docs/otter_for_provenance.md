# Adding a Provenance Log Folder to the Otter Submission Zip

## Overview

A `provenance/` folder can reach the Otter submission zip without changing Otter. The extension writes log files next to the student's notebook, and the assignment passes that folder to `grader.export(files=["provenance"])`.

The browser extension cannot add to the zip itself, because `Notebook.export` builds the zip in the Python kernel from files on disk. So the work has three parts:

1. **JupyterLab extension (TypeScript):** record events and write them to `provenance/` through the Jupyter Contents API.
2. **Assignment configuration (YAML):** ship a placeholder `provenance/` folder and list it under `export_cell.files`, so Otter zips the folder on every export.
3. **Optional Otter plugin (Python):** read the logs at grading time.

&#91;embedded content: path of a provenance log from browser to autograder\]

The extension never talks to Otter directly, so either side can change as long as the folder stays the same.

This guide targets Otter 7.0.0, the version in this repository.

## How Otter builds the zip

Otter builds the zip once, in the kernel, when the export cell runs. Paths are relative to the kernel's working directory, which is normally the notebook's folder. `Notebook.export` ([otter/check/notebook.py](https://github.com/ucbds-infra/otter-grader/blob/master/otter/check/notebook.py), lines 480–527) adds entries in this order:

1. The saved notebook.
2. The PDF, if enabled.
3. `.OTTER_LOG`, unless `ignore_log=True`.
4. `__zip_filename__`, which records the zip's name.
5. The `.otter` config file, if there is one.
6. Everything in the `files` argument.
7. Everything registered through `add_plugin_files`.

The `files` step treats a directory specially, and that drives most of this design. The results below come from running a copy of that loop with Python's `zipfile`, using the same `glob` pattern.

| `files` entry | Result in the zip |
| --- | --- |
| `provenance` with `events-1.jsonl` and `sub/b.jsonl` | Both files are added, and subfolders are kept |
| A file named `NOEXT` or `.dotfile` in the folder | Skipped, because the pattern is `**/*.*` and it ignores dotfiles |
| An empty folder | Nothing is added, and there is no error |
| A folder that does not exist | `FileNotFoundError`, so the export fails |

## Choosing an integration

Use `files`. It reads the folder at the moment of export, and it needs nothing installed in the kernel.

|  | `export(files=["provenance"])` (recommended) | `add_plugin_files` with a plugin |
| --- | --- | --- |
| When the file list is read | During export, so a re-run export picks up new logs | When the `add_plugin_files` cell runs, so a re-run of export alone misses new logs |
| Otter code needed | None | A plugin class |
| Install location | Nothing in the kernel | The plugin must import in the kernel environment |
| Assignment setup | One config key and a placeholder folder | A hand-written cell before the export cell |
| Folder missing | Export fails, so ship a placeholder | The plugin can return an empty list |
| Re-running | Safe | Re-running adds the paths again, and each repeat gives a `Duplicate name` warning |
| Unusual file names | Files need an extension and no leading dot | The plugin controls the exact list |

The install location matters because JupyterLab and the student's kernel often live in different environments. A package installed for JupyterLab may not be importable from the notebook.

A plugin's `notebook_export` must return individual file paths, not the folder. Passing `provenance` there adds only an empty `provenance/` entry, because `add_plugin_files` paths go straight to `zf.write`.

`student_files` will not work here. Otter Assign raises `FileNotFoundError: provenance is not a file` for a directory ([otter/assign/output.py](https://github.com/ucbds-infra/otter-grader/blob/master/otter/assign/output.py), line 61).

## Writing logs from the JupyterLab extension

The extension's only contract with Otter is to put finished files in `provenance/` beside the notebook. Start from the official [extension template](https://github.com/jupyterlab/extension-template), and distribute it as a [prebuilt extension](https://jupyterlab.readthedocs.io/en/latest/extension/extension_dev.html) through pip so students need no Node.js.

Follow these rules:

- **Use a visible folder name.** Jupyter Server rejects a PUT to a hidden path with HTTP 400 unless `allow_hidden` is on ([handlers.py](https://github.com/jupyter-server/jupyter_server/blob/main/jupyter_server/services/contents/handlers.py)), so `.provenance` fails.
- **Resolve the path from the notebook.** Contents API paths start at the server root, while Otter's paths start at the kernel's working directory. Join `dirname(notebookPath)` with `provenance`.
- **Write new files instead of appending.** `contents.save` replaces the whole file, so write each batch as a new numbered chunk and never delete old ones.
- **Use `.jsonl` file names.** Every file needs an extension and no leading dot, or Otter's pattern skips it.
- **Flush often.** Otter reads what is on disk, not what is buffered in the browser.

This sketch shows the storage layer. Add your own events through `record`.

```typescript
import { JupyterFrontEnd, JupyterFrontEndPlugin } from '@jupyterlab/application';
import { PathExt } from '@jupyterlab/coreutils';
import { INotebookTracker, Notebook, NotebookActions } from '@jupyterlab/notebook';
import { Contents } from '@jupyterlab/services';
import { UUID } from '@lumino/coreutils';

const FOLDER = 'provenance';
const FLUSH_INTERVAL_MS = 5000;

class ProvenanceWriter {
  private buffer: string[] = [];
  private chunk = 0;
  private queue: Promise<void> = Promise.resolve();
  private readonly session = UUID.uuid4();
  private readonly dir: string;

  constructor(private contents: Contents.IManager, notebookPath: string) {
    this.dir = PathExt.join(PathExt.dirname(notebookPath), FOLDER);
  }

  record(event: Record<string, unknown>): void {
    const entry = { time: new Date().toISOString(), session: this.session, ...event };
    this.buffer.push(JSON.stringify(entry));
  }

  flush(): Promise<void> {
    if (this.buffer.length > 0) {
      const lines = this.buffer.splice(0);
      const index = String(++this.chunk).padStart(6, '0');
      const path = PathExt.join(this.dir, `events-${this.session}-${index}.jsonl`);
      this.queue = this.queue.then(() => this.write(path, lines));
    }
    return this.queue;
  }

  private async write(path: string, lines: string[]): Promise<void> {
    try {
      // Recreates the folder if the student deleted it.
      await this.contents.save(this.dir, { type: 'directory' });
      await this.contents.save(path, {
        type: 'file',
        format: 'text',
        content: lines.join('\n') + '\n'
      });
    } catch (error) {
      console.warn('Could not write provenance log', error);
      this.buffer.unshift(...lines);
    }
  }
}

const plugin: JupyterFrontEndPlugin<void> = {
  id: 'otter-provenance:plugin',
  autoStart: true,
  requires: [INotebookTracker],
  activate: (app: JupyterFrontEnd, tracker: INotebookTracker) => {
    const writers = new WeakMap<Notebook, ProvenanceWriter>();

    tracker.widgetAdded.connect((_, panel) => {
      void panel.context.ready.then(() => {
        const writer = new ProvenanceWriter(app.serviceManager.contents, panel.context.path);
        writers.set(panel.content, writer);
        writer.record({ type: 'notebook_opened' });

        const timer = window.setInterval(() => void writer.flush(), FLUSH_INTERVAL_MS);
        panel.disposed.connect(() => {
          window.clearInterval(timer);
          void writer.flush();
        });
      });
    });

    NotebookActions.executionScheduled.connect((_, { notebook, cell }) => {
      const writer = writers.get(notebook);
      writer?.record({
        type: 'cell_scheduled',
        cellId: cell.model.id,
        source: cell.model.sharedModel.getSource()
      });
      // Flush here so the logs are on disk as soon as possible when the export cell runs.
      void writer?.flush();
    });

    NotebookActions.executed.connect((_, { notebook, cell, success }) => {
      writers.get(notebook)?.record({ type: 'cell_executed', cellId: cell.model.id, success });
    });
  }
};

export default plugin;
```

This code has not been compiled or run, because JupyterLab is not installed in the environment used to write this guide. The signal names and payloads were checked against JupyterLab's [actions.tsx](https://github.com/jupyterlab/jupyterlab/blob/main/packages/notebook/src/actions.tsx).

## Adding the folder to the zip

Otter needs no code change: one `files` argument adds the whole folder. In a notebook without Otter Assign, write the export cell by hand:

```python
grader.export(files=["provenance"])
```

The folder must exist when this runs. The extension creates it on its first write, about 5 seconds after the notebook opens. Students without the extension need the placeholder described in the next section.

## Setting up the assignment

Instructors using Otter Assign need one placeholder file and two config keys. Add `provenance/README.txt` beside the master notebook, then update the assignment config:

```yaml
# ASSIGNMENT CONFIG
files:
  - provenance            # copies the placeholder to students
export_cell:
  files:
    - provenance          # adds the folder to every submission zip
```

From this config, Otter Assign generates `grader.export(files=['provenance'])` along with any other export arguments you set. `files` also copies the placeholder into the autograder zip. That is harmless, because grading keeps the student's folder when one already exists.

The placeholder prevents the `FileNotFoundError`, so a student without the extension can still submit. Their zip then contains only `README.txt`, which also shows graders that no logs were recorded.

Delete any `.jsonl` files from the master folder before running Otter Assign. If the extension is active while you edit the master notebook, your own logs would be copied to every student.

## Reading the logs during grading

Otter ignores the folder during grading, so it cannot affect scores. It finds submissions with top-level patterns such as `glob("*.ipynb")`, so a file inside `provenance/` is never mistaken for one, even a notebook snapshot. Do not write logs or snapshots beside the notebook, though: a second top-level `.ipynb` stops grading with `More than one .ipynb file found in submission`.

| Grading route | Where the folder ends up |
| --- | --- |
| `otter run` | `submission/provenance/`, extracted in [otter/run/\_\_init\_\_.py](https://github.com/ucbds-infra/otter-grader/blob/master/otter/run/__init__.py) |
| `otter grade --ext zip` | `submission/provenance/`, extracted because `zips` is set to true |
| Gradescope | Not confirmed: Otter expects Gradescope to unpack the upload, so test it with a real submission |

To use the logs automatically, add a plugin. This one reads them in `before_grading`, before the student's code runs, because that code runs in the same folder and could change them.

```python
import json
import os

from glob import glob

from otter.plugins import AbstractOtterPlugin


class ProvenanceReport(AbstractOtterPlugin):

    def before_grading(self, config):
        self.events, self.bad_lines = [], 0
        folder = os.path.join(os.path.dirname(self.submission_path), "provenance")
        for path in sorted(glob(os.path.join(folder, "*.jsonl"))):
            with open(path, encoding="utf-8") as f:
                for line in f:
                    try:
                        self.events.append(json.loads(line))
                    except json.JSONDecodeError:
                        self.bad_lines += 1

    def generate_report(self):
        return f"{len(self.events)} provenance events, {self.bad_lines} unreadable lines"
```

This plugin has not been run. Register it under `generate` and add its package to the assignment's requirements so it can be imported during grading:

```yaml
generate:
  plugins:
    - my_package.ProvenanceReport
```

For manual review, unzip the submission and read the `.jsonl` files directly. Sort events by `time`, because chunks from different sessions overlap.

## Testing and known limits

Run these checks before using this with students. The zip behaviour in this guide was tested, but no part of it has run in a live JupyterLab session or on Gradescope.

- [ ] Opening a notebook creates `provenance/` beside it, including when the notebook is in a subfolder of the server root.
- [ ] `contents.save` with `type: 'directory'` succeeds, both when the folder is new and when it already exists.
- [ ] Running the export cell produces a zip containing `provenance/events-*.jsonl`.
- [ ] Re-running only the export cell produces a zip with the newer chunks.
- [ ] With the extension disabled, export still works and the zip contains `provenance/README.txt`.
- [ ] `otter run` grades the zip with the same score as the notebook alone.
- [ ] A real Gradescope submission keeps `provenance/` under `/autograder/submission/`.

These limits remain after that testing:

- **Newest events can be missing.** The final flush is asynchronous and can land after Otter has zipped the folder, so the export cell's own events may not appear. This matters most with `pdf=False`, which removes the delay of PDF generation.
- **The logs are not tamper-proof.** Students control the files on their own machine and can edit or delete them. Treat the logs as evidence to review, not proof.
- **Submitted logs need a matching folder.** If a student moves only the `.ipynb` to another folder, earlier logs stay behind and that zip contains only later ones.
- **Changing the working directory breaks the path.** After `%cd` in the notebook, `provenance` no longer resolves and export fails. Otter's other relative paths are affected too.
- **Students should be told what is recorded.** The sample logs every cell's source and when it ran, so disclose that in the assignment instructions.
- **Log size adds to the zip.** Otter sets no limit, but cell source repeated on every run grows with each execution.
