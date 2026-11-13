/**
 * Turns saved notebook bytes into the view and its hash, for `doc.save`.
 *
 * The hash is of the view of the notebook AS SAVED, read from disk, not of the in-memory
 * model, so the save-time external-change check compares like with like.
 */

import { sha256Hex } from '../core/index';
import {
  checkCells,
  textView,
  type CellSource,
  type CellType,
  type ViewProblem,
} from './text-view';

export type SavedView =
  | { ok: true; cells: CellSource[]; view: string; sha256: string }
  | { ok: false; reason: ViewProblem | 'not_a_notebook' };

const CELL_TYPES: ReadonlySet<string> = new Set(['code', 'markdown', 'raw']);

function sourceText(source: unknown): string | null {
  if (typeof source === 'string') return source;
  if (Array.isArray(source) && source.every((line) => typeof line === 'string')) {
    return source.join('');
  }
  return null;
}

/** Parse nbformat JSON text into cells. Never throws. */
export function cellsFromNotebookJson(text: string): CellSource[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const rawCells = (parsed as { cells?: unknown }).cells;
  if (!Array.isArray(rawCells)) return null;

  const cells: CellSource[] = [];
  for (const raw of rawCells) {
    if (typeof raw !== 'object' || raw === null) return null;
    const { id, cell_type, source } = raw as Record<string, unknown>;
    const text = sourceText(source);
    if (typeof cell_type !== 'string' || !CELL_TYPES.has(cell_type) || text === null) return null;
    cells.push({
      id: typeof id === 'string' ? id : '',
      cell_type: cell_type as CellType,
      source: text,
    });
  }
  return cells;
}

export function viewOfSavedNotebook(text: string): SavedView {
  const cells = cellsFromNotebookJson(text);
  if (cells === null) return { ok: false, reason: 'not_a_notebook' };
  const problem = checkCells(cells);
  if (problem !== null) return { ok: false, reason: problem };
  const view = textView(cells);
  return { ok: true, cells, view, sha256: sha256Hex(view) };
}
