import { describe, expect, it } from 'vitest';
import { cellBlock, checkCells, textView } from '../../src/notebook/text-view';

describe('textView', () => {
  it('renders each cell under its header, in order', () => {
    expect(
      textView([
        { id: 'a1b2c3', cell_type: 'code', source: 'import numpy as np\nx = np.arange(10)' },
        { id: 'd4e5f6', cell_type: 'markdown', source: '## Question 2' },
      ]),
    ).toBe(
      '# %% [code] id=a1b2c3\nimport numpy as np\nx = np.arange(10)\n' +
        '# %% [markdown] id=d4e5f6\n## Question 2\n',
    );
  });

  it('is the empty string for a notebook with no cells', () => {
    expect(textView([])).toBe('');
  });

  it('keeps an empty cell as a header and an empty line', () => {
    expect(cellBlock({ id: 'x', cell_type: 'raw', source: '' })).toBe('# %% [raw] id=x\n\n');
  });
});

describe('checkCells', () => {
  it('accepts unique ids', () => {
    expect(checkCells([{ id: 'a', cell_type: 'code', source: '' }])).toBeNull();
  });

  it('reports a missing id instead of throwing', () => {
    expect(checkCells([{ id: '', cell_type: 'code', source: '' }])).toBe('missing_cell_id');
  });

  it('reports a duplicate id instead of throwing', () => {
    const cell = { id: 'a', cell_type: 'code' as const, source: '' };
    expect(checkCells([cell, { ...cell }])).toBe('duplicate_cell_id');
  });
});
