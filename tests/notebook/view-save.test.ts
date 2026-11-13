import { describe, expect, it } from 'vitest';
import { sha256Hex } from '../../src/core/index';
import { cellsFromNotebookJson, viewOfSavedNotebook } from '../../src/notebook/view-save';
import { textView } from '../../src/notebook/text-view';

const notebook = (cells: unknown[]): string =>
  JSON.stringify({ nbformat: 4, nbformat_minor: 5, metadata: {}, cells });

describe('viewOfSavedNotebook', () => {
  it('hashes the view of the saved cells, ignoring outputs and metadata', () => {
    const text = notebook([
      {
        id: 'a',
        cell_type: 'code',
        source: ['x = 1\n', 'y = 2'],
        outputs: [{ output_type: 'stream', text: 'noise' }],
        execution_count: 7,
        metadata: { tags: ['t'] },
      },
    ]);
    const expected = textView([{ id: 'a', cell_type: 'code', source: 'x = 1\ny = 2' }]);
    expect(viewOfSavedNotebook(text)).toEqual({
      ok: true,
      cells: [{ id: 'a', cell_type: 'code', source: 'x = 1\ny = 2' }],
      view: expected,
      sha256: sha256Hex(expected),
    });
  });

  it('gives the same hash when only outputs change', () => {
    const cell = { id: 'a', cell_type: 'code', source: 'x' };
    const one = viewOfSavedNotebook(notebook([{ ...cell, outputs: [] }]));
    const two = viewOfSavedNotebook(notebook([{ ...cell, outputs: [{ output_type: 'error' }] }]));
    expect(one.ok && two.ok && one.sha256 === two.sha256).toBe(true);
  });

  it('rejects notebooks without cell ids (nbformat before 4.5)', () => {
    expect(viewOfSavedNotebook(notebook([{ cell_type: 'code', source: 'x' }]))).toEqual({
      ok: false,
      reason: 'missing_cell_id',
    });
  });

  it('rejects text that is not a notebook, without throwing', () => {
    expect(cellsFromNotebookJson('{not json')).toBeNull();
    expect(viewOfSavedNotebook('{"cells": 3}')).toEqual({ ok: false, reason: 'not_a_notebook' });
  });
});
