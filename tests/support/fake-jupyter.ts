/**
 * Fakes for the JupyterLab objects `jupyter-documents.ts` uses: signals, shared notebooks,
 * cells and files, document contexts, widgets and trackers. Each change is reported the way
 * `@jupyter/ydoc` reports it: a Quill-style delta of `retain` / `insert` / `delete`.
 */

import type {
  DocumentContextLike,
  DocumentWidgetLike,
  SharedCellLike,
  SharedFileLike,
  SharedNotebookLike,
  SignalLike,
  TrackerLike,
} from '../../src/recorder/wiring/jupyter-documents';

export class FakeSignal<A> implements SignalLike<A> {
  private readonly slots = new Set<(sender: unknown, args: A) => void>();

  connect(slot: (sender: unknown, args: A) => void): boolean {
    this.slots.add(slot);
    return true;
  }

  disconnect(slot: (sender: unknown, args: A) => void): boolean {
    return this.slots.delete(slot);
  }

  emit(args: A): void {
    for (const slot of [...this.slots]) slot(this, args);
  }

  get listeners(): number {
    return this.slots.size;
  }
}

type Delta = { retain?: number; insert?: string; delete?: number }[];

/** Apply a delta to text, the way Yjs does. */
function apply(text: string, delta: Delta): string {
  let at = 0;
  let out = text;
  for (const op of delta) {
    if (op.retain !== undefined) at += op.retain;
    else if (op.insert !== undefined) {
      out = out.slice(0, at) + op.insert + out.slice(at);
      at += op.insert.length;
    } else if (op.delete !== undefined) out = out.slice(0, at) + out.slice(at + op.delete);
  }
  return out;
}

export class FakeCell implements SharedCellLike {
  readonly changed = new FakeSignal<{ sourceChange?: unknown }>();

  constructor(
    readonly id: string,
    public cell_type: string,
    private source: string,
  ) {}

  getSource(): string {
    return this.source;
  }

  /** Change the source and report it, as typing in a cell would. */
  edit(delta: Delta): void {
    this.source = apply(this.source, delta);
    this.changed.emit({ sourceChange: delta });
  }

  /** Change the source without reporting it yet. */
  setSilently(source: string): void {
    this.source = source;
  }
}

export class FakeNotebook implements SharedNotebookLike {
  readonly changed = new FakeSignal<{ cellsChange?: unknown }>();

  constructor(public cells: FakeCell[]) {}

  /** Replace the cell list and report it. */
  setCells(cells: FakeCell[]): void {
    this.cells = cells;
    this.changed.emit({ cellsChange: [{ insert: cells }] });
  }
}

export class FakeFile implements SharedFileLike {
  readonly changed = new FakeSignal<unknown>();

  constructor(private source: string) {}

  getSource(): string {
    return this.source;
  }

  edit(delta: Delta): void {
    this.source = apply(this.source, delta);
    this.changed.emit({ sourceChange: delta });
  }
}

export class FakeContext<M> implements DocumentContextLike<M> {
  readonly saveState = new FakeSignal<'started' | 'completed' | 'failed'>();
  readonly pathChanged = new FakeSignal<string>();
  readonly ready: Promise<void>;
  readonly model: { sharedModel: M };
  private resolveReady!: () => void;

  constructor(
    public path: string,
    sharedModel: M,
  ) {
    this.model = { sharedModel };
    this.ready = new Promise((resolve) => (this.resolveReady = resolve));
  }

  load(): Promise<void> {
    this.resolveReady();
    return this.ready.then(() => flush());
  }

  rename(path: string): void {
    this.path = path;
    this.pathChanged.emit(path);
  }
}

export class FakeWidget<M> implements DocumentWidgetLike<M> {
  readonly disposed = new FakeSignal<void>();

  constructor(readonly context: FakeContext<M>) {}

  close(): void {
    this.disposed.emit(undefined);
  }
}

export class FakeTracker<W> implements TrackerLike<W> {
  readonly widgetAdded = new FakeSignal<W>();
  readonly widgets: W[] = [];

  add(widget: W): void {
    this.widgets.push(widget);
    this.widgetAdded.emit(widget);
  }

  forEach(fn: (widget: W) => void): void {
    this.widgets.forEach(fn);
  }
}

/** Let pending promise callbacks run. */
export function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
