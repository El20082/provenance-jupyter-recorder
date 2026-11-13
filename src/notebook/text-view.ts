/**
 * The `ipynb-source-v1` text view of a notebook: the cell sources, each under a header line.
 *
 *   view(nb) = concat over cells, in order, of
 *                "# %% [" + cell_type + "] id=" + cell_id + "\n" + source + "\n"
 *
 * This is the README's DRAFT definition. It belongs in log-core with test vectors and is
 * awaiting monorepo-owner approval (docs/monorepo-owner-requests.md items 1 and 2). Until
 * then this local copy is the only definition; replace it with log-core's once approved.
 */

export type CellType = 'code' | 'markdown' | 'raw';

export interface CellSource {
  id: string;
  cell_type: CellType;
  source: string;
}

/** The header line of a cell's block, including its trailing newline. */
export function cellHeader(cell: Pick<CellSource, 'id' | 'cell_type'>): string {
  return `# %% [${cell.cell_type}] id=${cell.id}\n`;
}

/** One cell's block of the view: header, source, then a newline. */
export function cellBlock(cell: CellSource): string {
  return `${cellHeader(cell)}${cell.source}\n`;
}

/** The whole view. A notebook with no cells has the empty string as its view. */
export function textView(cells: readonly CellSource[]): string {
  let view = '';
  for (const cell of cells) view += cellBlock(cell);
  return view;
}

/** Why a notebook cannot be recorded as a view. */
export type ViewProblem = 'missing_cell_id' | 'duplicate_cell_id';

/**
 * Cell ids are what make the view stable, so a notebook without them cannot be recorded.
 * Notebooks older than nbformat 4.5 have none: how to handle them is an open edge case
 * (docs/monorepo-owner-requests.md item 2). Returned as a value; never thrown, because a
 * throw in a signal handler would stop recording for every other file too.
 */
export function checkCells(cells: readonly CellSource[]): ViewProblem | null {
  const seen = new Set<string>();
  for (const cell of cells) {
    if (cell.id === '') return 'missing_cell_id';
    if (seen.has(cell.id)) return 'duplicate_cell_id';
    seen.add(cell.id);
  }
  return null;
}
