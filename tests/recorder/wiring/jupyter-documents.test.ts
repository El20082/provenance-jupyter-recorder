import { beforeAll, describe, expect, it } from 'vitest';
import { FixedClock, parseEntries, sha256Hex, validateChain } from '../../../src/core/index';
import type { DocChangePayload, HashedEnvelope, Manifest } from '../../../src/core/index';
import { textView } from '../../../src/notebook/text-view';
import { verifyManifestText } from '../../../src/recorder/activation/manifest-loader';
import type { Timers } from '../../../src/recorder/io/session-writer';
import {
  startRecordingSession,
  type RecordingSession,
} from '../../../src/recorder/session/recording-session';
import {
  connectJupyterDocuments,
  type SharedFileLike,
  type SharedNotebookLike,
} from '../../../src/recorder/wiring/jupyter-documents';
import { FakeServer } from '../../support/fake-server';
import {
  FakeCell,
  FakeContext,
  FakeFile,
  FakeNotebook,
  FakeTracker,
  FakeWidget,
  flush,
} from '../../support/fake-jupyter';
import type { TimeKeystroke } from '../../../src/recorder/perf/keystroke-timing';
import { signedManifest, testKey } from '../../support/manifests';
import { applyDeltas } from '../../support/replay';

const noTimers: Timers = { setInterval: () => 0, clearInterval: () => undefined };
let manifest: Manifest;

beforeAll(async () => {
  const root = await testKey();
  const verified = await verifyManifestText(
    JSON.stringify(await signedManifest({ root })),
    root.publicKeyHex,
  );
  if (!verified.ok) throw new Error('fixture manifest did not verify');
  manifest = verified.value;
});

async function setup(roots = ['data100/hw1'], timeKeystroke?: TimeKeystroke) {
  const server = new FakeServer();
  const sessions: RecordingSession[] = [];
  for (const [i, root] of roots.entries()) {
    sessions.push(
      await startRecordingSession({
        server,
        root,
        manifest,
        clock: new FixedClock(0, new Date('2026-11-13T00:00:00.000Z')),
        host: server.host,
        recorderVersion: '0.0.0',
        jupyterlabVersion: '4.5.0',
        newSessionId: () => `00000000-0000-4000-8000-00000000000${i}`,
        timers: noTimers,
      }),
    );
  }
  const notebooks = new FakeTracker<FakeWidget<SharedNotebookLike>>();
  const editors = new FakeTracker<FakeWidget<SharedFileLike>>();
  // The saved text per path; an Error makes the read reject, as a failed request would.
  const saved = new Map<string, string | Error>();
  const documents = connectJupyterDocuments({
    sessions: () => sessions,
    notebooks,
    editors,
    readSavedText: (path) => {
      const text = saved.get(path);
      return text instanceof Error ? Promise.reject(text) : Promise.resolve(text ?? null);
    },
    ...(timeKeystroke !== undefined ? { timeKeystroke } : {}),
  });

  async function log(index = 0): Promise<readonly HashedEnvelope[]> {
    await sessions[index]!.writer.flush();
    const file = [...server.files.keys()].find((p) => p.startsWith(`${roots[index]}/`))!;
    const parsed = parseEntries(server.text(file));
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.error));
    return parsed.value;
  }
  return { server, sessions, notebooks, editors, saved, documents, log };
}

function replay(entries: readonly HashedEnvelope[], path: string): string {
  let text: string | null = null;
  for (const e of entries) {
    const data = e.data as { path?: string; content?: string };
    if (data.path !== path) continue;
    if (e.kind === 'doc.open') text = data.content ?? null;
    if (e.kind === 'doc.change' && text !== null) {
      text = applyDeltas(text, (e.data as DocChangePayload).deltas);
    }
  }
  return text ?? '';
}

const kinds = (entries: readonly HashedEnvelope[]) => entries.map((e) => e.kind);

describe('connectJupyterDocuments: notebooks', () => {
  async function openNotebook(env: Awaited<ReturnType<typeof setup>>, path: string) {
    const cells = [
      new FakeCell('a', 'code', 'import numpy as np'),
      new FakeCell('b', 'markdown', '## Q1'),
    ];
    const notebook = new FakeNotebook(cells);
    const context = new FakeContext<SharedNotebookLike>(path, notebook);
    const widget = new FakeWidget(context);
    env.notebooks.add(widget);
    await context.load();
    return { cells, notebook, context, widget };
  }

  it('records typing, cell changes, save and close, and the log replays to the notebook', async () => {
    const env = await setup();
    const { cells, notebook, widget } = await openNotebook(env, 'data100/hw1/hw1.ipynb');

    for (const ch of '\nx = 1') {
      cells[0]!.edit([{ retain: cells[0]!.getSource().length }, { insert: ch }]);
    }
    const added = new FakeCell('c', 'code', 'print(x)');
    notebook.setCells([cells[0]!, added, cells[1]!]);
    added.edit([{ retain: 6 }, { insert: '  ' }]);

    const finalCells = notebook.cells.map((c) => ({
      id: c.id,
      cell_type: c.cell_type as 'code' | 'markdown',
      source: c.getSource(),
    }));
    env.saved.set(
      'data100/hw1/hw1.ipynb',
      JSON.stringify({ nbformat: 4, nbformat_minor: 5, metadata: {}, cells: finalCells }),
    );
    widget.context.saveState.emit('completed');
    await flush();
    widget.close();

    const entries = await env.log();
    expect(validateChain(entries).ok).toBe(true);
    expect(kinds(entries)).toEqual([
      'session.start',
      'doc.open',
      ...Array(6).fill('doc.change'),
      'doc.change',
      'doc.change',
      'doc.save',
      'doc.close',
    ]);
    expect(replay(entries, 'hw1.ipynb')).toBe(textView(finalCells));
    const save = entries.find((e) => e.kind === 'doc.save')!;
    expect(save.data).toEqual({ path: 'hw1.ipynb', sha256: sha256Hex(textView(finalCells)) });
  });

  it('still records a save whose file cannot be read back', async () => {
    const env = await setup();
    const { cells, widget } = await openNotebook(env, 'data100/hw1/hw1.ipynb');
    cells[0]!.edit([{ retain: cells[0]!.getSource().length }, { insert: '!' }]);
    widget.context.saveState.emit('completed'); // nothing to read: the read returns null
    await flush();

    const entries = await env.log();
    const view = replay(entries, 'hw1.ipynb');
    const save = entries.find((e) => e.kind === 'doc.save')!;
    expect(save.data).toEqual({ path: 'hw1.ipynb', sha256: sha256Hex(view) });
  });

  it('records nothing until the notebook has loaded', async () => {
    const env = await setup();
    const cell = new FakeCell('a', 'code', '');
    const context = new FakeContext<SharedNotebookLike>(
      'data100/hw1/hw1.ipynb',
      new FakeNotebook([cell]),
    );
    env.notebooks.add(new FakeWidget(context));
    cell.edit([{ insert: 'loading' }]);
    expect(kinds(await env.log())).toEqual(['session.start']);
    await context.load();
    expect(kinds(await env.log())).toEqual(['session.start', 'doc.open']);
  });

  it('ignores notebooks outside every assignment folder', async () => {
    const env = await setup();
    await openNotebook(env, 'scratch/notes.ipynb');
    expect(kinds(await env.log())).toEqual(['session.start']);
  });

  it('keeps the view exact when a cell list change already includes a source change', async () => {
    const env = await setup();
    const { cells, notebook } = await openNotebook(env, 'data100/hw1/hw1.ipynb');
    // As when cells merge: the source change lands with the list change, and its own
    // signal arrives afterwards.
    cells[0]!.setSilently('import numpy as np\n## Q1');
    notebook.setCells([cells[0]!]);
    cells[0]!.changed.emit({ sourceChange: [{ retain: 18 }, { insert: '\n## Q1' }] });
    const entries = await env.log();
    expect(replay(entries, 'hw1.ipynb')).toBe(
      textView([{ id: 'a', cell_type: 'code', source: 'import numpy as np\n## Q1' }]),
    );
  });

  it('records a notebook once however many views it has, and closes it with the last view', async () => {
    const env = await setup();
    const { context, widget } = await openNotebook(env, 'data100/hw1/hw1.ipynb');
    const second = new FakeWidget(context);
    env.notebooks.add(second);
    widget.close();
    expect(kinds(await env.log())).toEqual(['session.start', 'doc.open']);
    second.close();
    expect(kinds(await env.log())).toEqual(['session.start', 'doc.open', 'doc.close']);
  });

  it('closes the old path and opens the new one on rename', async () => {
    const env = await setup();
    const { context } = await openNotebook(env, 'data100/hw1/hw1.ipynb');
    context.rename('data100/hw1/renamed.ipynb');
    const entries = await env.log();
    expect(entries.map((e) => [e.kind, (e.data as { path?: string }).path])).toEqual([
      ['session.start', undefined],
      ['doc.open', 'hw1.ipynb'],
      ['doc.close', 'hw1.ipynb'],
      ['doc.open', 'renamed.ipynb'],
    ]);
  });

  it('stops listening on dispose', async () => {
    const env = await setup();
    const { cells, notebook } = await openNotebook(env, 'data100/hw1/hw1.ipynb');
    env.documents.dispose();
    expect(cells[0]!.changed.listeners).toBe(0);
    expect(notebook.changed.listeners).toBe(0);
    expect(env.notebooks.widgetAdded.listeners).toBe(0);
  });
});

describe('connectJupyterDocuments: text files', () => {
  it('records a text file like VS Code, routed to the right assignment', async () => {
    const env = await setup(['data100/hw1', 'data100/hw2']);
    const file = new FakeFile('def f():\n');
    const context = new FakeContext<SharedFileLike>('data100/hw2/util.py', file);
    const widget = new FakeWidget(context);
    env.editors.add(widget);
    await context.load();
    for (const ch of '    return 1\n')
      file.edit([{ retain: file.getSource().length }, { insert: ch }]);
    env.saved.set('data100/hw2/util.py', file.getSource());
    context.saveState.emit('completed');
    await flush();
    widget.close();

    const entries = await env.log(1);
    expect(validateChain(entries).ok).toBe(true);
    expect(kinds(entries).filter((k) => k !== 'doc.change')).toEqual([
      'session.start',
      'doc.open',
      'doc.save',
      'doc.close',
    ]);
    expect(kinds(entries).filter((k) => k === 'doc.change')).toHaveLength(13);
    expect(replay(entries, 'util.py')).toBe('def f():\n    return 1\n');
    expect(kinds(await env.log(0))).toEqual(['session.start']);
  });

  it('still records a save when reading the saved file fails', async () => {
    const env = await setup();
    const file = new FakeFile('x = 1\n');
    const context = new FakeContext<SharedFileLike>('data100/hw1/util.py', file);
    env.editors.add(new FakeWidget(context));
    await context.load();
    file.edit([{ retain: file.getSource().length }, { insert: 'y' }]);
    env.saved.set('data100/hw1/util.py', new Error('network down'));
    context.saveState.emit('completed');
    await flush();

    const entries = await env.log();
    const save = entries.find((e) => e.kind === 'doc.save')!;
    expect(save.data).toEqual({ path: 'util.py', sha256: sha256Hex('x = 1\ny') });
  });

  it('leaves notebooks opened in the text editor to the notebook tracker', async () => {
    const env = await setup();
    const context = new FakeContext<SharedFileLike>('data100/hw1/hw1.ipynb', new FakeFile('{}'));
    env.editors.add(new FakeWidget(context));
    await context.load();
    expect(kinds(await env.log())).toEqual(['session.start']);
  });

  it('picks up documents that were already open when recording started', async () => {
    const server = new FakeServer();
    const session = await startRecordingSession({
      server,
      root: 'data100/hw1',
      manifest,
      clock: new FixedClock(),
      host: server.host,
      recorderVersion: '0.0.0',
      jupyterlabVersion: '4.5.0',
      timers: noTimers,
    });
    const editors = new FakeTracker<FakeWidget<SharedFileLike>>();
    const context = new FakeContext<SharedFileLike>('data100/hw1/a.py', new FakeFile('x'));
    editors.widgets.push(new FakeWidget(context));
    connectJupyterDocuments({
      sessions: () => [session],
      notebooks: new FakeTracker(),
      editors,
      readSavedText: () => Promise.resolve(null),
    });
    await context.load();
    await session.writer.flush();
    const text = server.text([...server.files.keys()][0]!);
    expect(text).toContain('"kind":"doc.open"');
  });
});

describe('connectJupyterDocuments: keystroke timing hook', () => {
  it('runs each keystroke handler through the hook once, and nothing else', async () => {
    let timed = 0;
    const env = await setup(['data100/hw1'], (handler) => {
      timed++;
      handler();
    });
    const cell = new FakeCell('a', 'code', '');
    const nbContext = new FakeContext<SharedNotebookLike>(
      'data100/hw1/hw1.ipynb',
      new FakeNotebook([cell]),
    );
    env.notebooks.add(new FakeWidget(nbContext));
    await nbContext.load();
    const file = new FakeFile('');
    const fileContext = new FakeContext<SharedFileLike>('data100/hw1/util.py', file);
    env.editors.add(new FakeWidget(fileContext));
    await fileContext.load();

    for (const ch of 'abc') cell.edit([{ retain: cell.getSource().length }, { insert: ch }]);
    for (const ch of 'de') file.edit([{ retain: file.getSource().length }, { insert: ch }]);
    nbContext.saveState.emit('completed');
    await flush();

    expect(timed).toBe(5);
    const entries = await env.log();
    expect(entries.filter((e) => e.kind === 'doc.change')).toHaveLength(5);
  });
});
