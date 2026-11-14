/**
 * Connects JupyterLab's open documents to the recording sessions.
 *
 * Follows every notebook (`INotebookTracker`) and text file editor (`IEditorTracker`). For each
 * document in a verified assignment folder, it waits for the document to load, then turns the
 * shared model's changes into `NotebookWiring` / `FileWiring` calls on the owning session:
 *
 * - load            -> doc.open
 * - cell or text edit -> doc.change, one per shared-model change, as the student types
 * - cell list change  -> doc.change (cells added, deleted, moved, or changed type)
 * - save completed    -> doc.save, hashed from the file read back from disk
 * - last view closed  -> doc.close
 *
 * Everything is typed against the small interfaces below, which JupyterLab's real objects
 * satisfy, so tests drive it with fakes (CLAUDE.md: mock at the seam).
 *
 * Known gap, for Task 6.4: when JupyterLab reloads a file changed on disk, the reload arrives as
 * ordinary shared-model changes, so it is recorded as doc.change, not fs.external_change.
 */

import type { CellType, CellSource } from '../../notebook/text-view';
import { normalizeDelta } from '../events/doc-events';
import { untimed, type TimeKeystroke } from '../perf/keystroke-timing';
import type { RecordingSession } from '../session/recording-session';
import { routePath, type Route } from '../session/session-router';

// ---------------------------------------------------------------------------
// The seam: the parts of JupyterLab this module uses
// ---------------------------------------------------------------------------

export interface SignalLike<A> {
  connect(slot: (sender: unknown, args: A) => void): boolean;
  disconnect(slot: (sender: unknown, args: A) => void): boolean;
}

export interface SharedCellLike {
  readonly id: string;
  readonly cell_type: string;
  getSource(): string;
  readonly changed: SignalLike<{ sourceChange?: unknown }>;
}

export interface SharedNotebookLike {
  readonly cells: readonly SharedCellLike[];
  readonly changed: SignalLike<{ cellsChange?: unknown }>;
}

export interface SharedFileLike {
  /** JupyterLab types this as any JSON value; a text file's source is a string. */
  getSource(): unknown;
  /** Typed loosely too: the editor's model is declared as a generic shared document. */
  readonly changed: SignalLike<unknown>;
}

export interface DocumentContextLike<M> {
  readonly path: string;
  readonly ready: Promise<void>;
  readonly model: { readonly sharedModel: M };
  readonly saveState: SignalLike<'started' | 'completed' | 'failed'>;
  readonly pathChanged: SignalLike<string>;
}

export interface DocumentWidgetLike<M> {
  readonly context: DocumentContextLike<M>;
  readonly disposed: SignalLike<void>;
}

export interface TrackerLike<W> {
  readonly widgetAdded: SignalLike<W>;
  forEach(fn: (widget: W) => void): void;
}

export interface JupyterDocumentsDeps {
  sessions: () => readonly RecordingSession[];
  notebooks: TrackerLike<DocumentWidgetLike<SharedNotebookLike>>;
  editors: TrackerLike<DocumentWidgetLike<SharedFileLike>>;
  /** The file's text as saved on disk, or `null` if it could not be read. */
  readSavedText: (serverPath: string) => Promise<string | null>;
  /** Wraps each keystroke handler; times it only for the browser check. Default: untimed. */
  timeKeystroke?: TimeKeystroke;
}

export interface Disposable {
  dispose(): void;
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

const CELL_TYPES: ReadonlySet<string> = new Set(['code', 'markdown', 'raw']);

/** The notebook's cells as the text view sees them. `null` if a cell type is unknown. */
export function snapshotCells(notebook: SharedNotebookLike): CellSource[] | null {
  const cells: CellSource[] = [];
  for (const cell of notebook.cells) {
    if (!CELL_TYPES.has(cell.cell_type)) return null;
    cells.push({ id: cell.id, cell_type: cell.cell_type as CellType, source: cell.getSource() });
  }
  return cells;
}

/** The `sourceChange` of a shared-model change, or `undefined` when there is none. */
export function sourceChangeOf(change: unknown): unknown {
  if (typeof change !== 'object' || change === null) return undefined;
  const delta = (change as { sourceChange?: unknown }).sourceChange;
  return delta === null ? undefined : delta;
}

/** Notebooks open in the text editor are recorded by the notebook tracker, not here. */
export function isNotebookPath(path: string): boolean {
  return path.toLowerCase().endsWith('.ipynb');
}

// ---------------------------------------------------------------------------
// Per-document recorders
// ---------------------------------------------------------------------------

interface DocumentRecorder {
  close(): void;
}

/**
 * Records a completed save once the saved file has been read back. A read that fails, by
 * returning `null` or rejecting, still records the save, with `null` for the text: the wirings
 * then hash what they hold, as VS Code does when it cannot read a saved file.
 */
function recordSave(read: Promise<string | null>, save: (text: string | null) => void): void {
  read.then(save, () => save(null));
}

function recordNotebook(
  route: Route,
  serverPath: string,
  shared: SharedNotebookLike,
  context: DocumentContextLike<SharedNotebookLike>,
  readSavedText: JupyterDocumentsDeps['readSavedText'],
  time: TimeKeystroke,
): DocumentRecorder | null {
  const wiring = route.session.notebooks;
  const cells = snapshotCells(shared);
  if (cells === null || !wiring.opened(route.path, cells).ok) return null;

  const cellSlots = new Map<SharedCellLike, (s: unknown, a: { sourceChange?: unknown }) => void>();
  const watchCell = (cell: SharedCellLike): void => {
    if (cellSlots.has(cell)) return;
    const id = cell.id;
    const slot = (_: unknown, change: { sourceChange?: unknown }): void => {
      const delta = change.sourceChange;
      if (delta === undefined || delta === null) return;
      time(() => wiring.sourceChanged(route.path, id, normalizeDelta(delta), cell.getSource()));
    };
    cell.changed.connect(slot);
    cellSlots.set(cell, slot);
  };
  const syncCellWatchers = (): void => {
    const current = new Set(shared.cells);
    for (const [cell, slot] of cellSlots) {
      if (!current.has(cell)) {
        cell.changed.disconnect(slot);
        cellSlots.delete(cell);
      }
    }
    shared.cells.forEach(watchCell);
  };
  syncCellWatchers();

  const onNotebookChanged = (_: unknown, change: { cellsChange?: unknown }): void => {
    if (change.cellsChange === undefined || change.cellsChange === null) return;
    const next = snapshotCells(shared);
    if (next !== null) wiring.cellsChanged(route.path, next);
    syncCellWatchers();
  };
  shared.changed.connect(onNotebookChanged);

  const onSaveState = (_: unknown, state: 'started' | 'completed' | 'failed'): void => {
    if (state !== 'completed') return;
    recordSave(readSavedText(serverPath), (text) => wiring.saved(route.path, text));
  };
  context.saveState.connect(onSaveState);

  return {
    close(): void {
      shared.changed.disconnect(onNotebookChanged);
      context.saveState.disconnect(onSaveState);
      for (const [cell, slot] of cellSlots) cell.changed.disconnect(slot);
      cellSlots.clear();
      wiring.closed(route.path);
    },
  };
}

function recordFile(
  route: Route,
  serverPath: string,
  shared: SharedFileLike,
  context: DocumentContextLike<SharedFileLike>,
  readSavedText: JupyterDocumentsDeps['readSavedText'],
  time: TimeKeystroke,
): DocumentRecorder | null {
  const wiring = route.session.files;
  const initial = shared.getSource();
  if (typeof initial !== 'string') return null;
  wiring.opened(route.path, initial);

  const onChanged = (_: unknown, change: unknown): void => {
    const delta = sourceChangeOf(change);
    if (delta === undefined) return;
    time(() => {
      const current = shared.getSource();
      if (typeof current !== 'string') return;
      wiring.sourceChanged(route.path, normalizeDelta(delta), current);
    });
  };
  shared.changed.connect(onChanged);

  const onSaveState = (_: unknown, state: 'started' | 'completed' | 'failed'): void => {
    if (state !== 'completed') return;
    recordSave(readSavedText(serverPath), (text) => wiring.saved(route.path, text));
  };
  context.saveState.connect(onSaveState);

  return {
    close(): void {
      shared.changed.disconnect(onChanged);
      context.saveState.disconnect(onSaveState);
      wiring.closed(route.path);
    },
  };
}

// ---------------------------------------------------------------------------
// Tracker wiring
// ---------------------------------------------------------------------------

/**
 * One recorder per document context, shared by all of its views. A context is recorded from
 * the moment it loads until its last view closes. A rename closes the old path and opens the
 * new one, so each path's events stay self-contained.
 */
class ContextRecorders<M> {
  private readonly entries = new Map<
    DocumentContextLike<M>,
    { views: number; recorder: DocumentRecorder | null; onRename: () => void }
  >();
  private disposed = false;

  constructor(
    private readonly start: (context: DocumentContextLike<M>, shared: M) => DocumentRecorder | null,
  ) {}

  add(widget: DocumentWidgetLike<M>): void {
    if (this.disposed) return;
    const context = widget.context;
    const existing = this.entries.get(context);
    if (existing !== undefined) {
      existing.views++;
    } else {
      const entry = {
        views: 1,
        recorder: null as DocumentRecorder | null,
        onRename: (): void => {
          entry.recorder?.close();
          entry.recorder = this.start(context, context.model.sharedModel);
        },
      };
      this.entries.set(context, entry);
      void context.ready.then(() => {
        if (this.entries.get(context) !== entry || this.disposed) return;
        entry.recorder = this.start(context, context.model.sharedModel);
        context.pathChanged.connect(entry.onRename);
      });
    }
    const onDisposed = (): void => {
      widget.disposed.disconnect(onDisposed);
      this.remove(context);
    };
    widget.disposed.connect(onDisposed);
  }

  private remove(context: DocumentContextLike<M>): void {
    const entry = this.entries.get(context);
    if (entry === undefined) return;
    entry.views--;
    if (entry.views > 0) return;
    context.pathChanged.disconnect(entry.onRename);
    entry.recorder?.close();
    this.entries.delete(context);
  }

  dispose(): void {
    this.disposed = true;
    for (const [context, entry] of this.entries) {
      context.pathChanged.disconnect(entry.onRename);
      entry.recorder?.close();
    }
    this.entries.clear();
  }
}

export function connectJupyterDocuments(deps: JupyterDocumentsDeps): Disposable {
  const time = deps.timeKeystroke ?? untimed;
  const notebooks = new ContextRecorders<SharedNotebookLike>((context, shared) => {
    const route = routePath(context.path, deps.sessions());
    if (route === null) return null;
    return recordNotebook(route, context.path, shared, context, deps.readSavedText, time);
  });
  const files = new ContextRecorders<SharedFileLike>((context, shared) => {
    if (isNotebookPath(context.path)) return null;
    const route = routePath(context.path, deps.sessions());
    if (route === null) return null;
    return recordFile(route, context.path, shared, context, deps.readSavedText, time);
  });

  const onNotebookAdded = (_: unknown, widget: DocumentWidgetLike<SharedNotebookLike>): void =>
    notebooks.add(widget);
  const onEditorAdded = (_: unknown, widget: DocumentWidgetLike<SharedFileLike>): void =>
    files.add(widget);

  deps.notebooks.widgetAdded.connect(onNotebookAdded);
  deps.editors.widgetAdded.connect(onEditorAdded);
  deps.notebooks.forEach((widget) => notebooks.add(widget));
  deps.editors.forEach((widget) => files.add(widget));

  return {
    dispose(): void {
      deps.notebooks.widgetAdded.disconnect(onNotebookAdded);
      deps.editors.widgetAdded.disconnect(onEditorAdded);
      notebooks.dispose();
      files.dispose();
    },
  };
}
