/**
 * Wrapper around the ipynb-source-v1 projection, which belongs in log-core.
 *
 * TODO: not implemented. See docs/design.md.
 */

export interface CellSource {
  id: string;
  cell_type: 'code' | 'markdown' | 'raw';
  source: string;
}

export function textView(cells: readonly CellSource[]): string {
  return cells
    .map(cell =>
      `# %% [${cell.cell_type}] id=${cell.id}\n${cell.source}\n`
    )
    .join('');
}
