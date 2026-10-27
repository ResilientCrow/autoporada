import { describe, expect, it } from 'vitest';

import { cs } from '@/ui/copy';

import { previewNotices } from './preview-notice';

const NONE = { people: 0, peopleBullets: 0, textBullets: 0, statements: 0 };

describe('previewNotices', () => {
  it('says nothing when nothing was left out', () => {
    expect(previewNotices(NONE)).toEqual([]);
  });

  it('names the people left out, in colon form', () => {
    expect(previewNotices({ ...NONE, people: 2 })).toEqual([
      'Osoby bez oslovení nebo příjmení se v\u00a0náhledu nezobrazí: 2.',
    ]);
  });

  it('adds the empty people rows and the empty text rows into one count', () => {
    expect(previewNotices({ ...NONE, peopleBullets: 1, textBullets: 2 })).toEqual([
      'Prázdné nebo nepojmenované řádky se v\u00a0náhledu nezobrazí: 3.',
    ]);
  });

  it('names the incomplete statements', () => {
    expect(previewNotices({ ...NONE, statements: 1 })).toEqual([
      'Neúplná vyjádření se v\u00a0náhledu nezobrazí: 1.',
    ]);
  });

  it('lists every non-zero count, in the order people, rows, statements', () => {
    expect(previewNotices({ people: 1, peopleBullets: 0, textBullets: 4, statements: 3 })).toEqual([
      'Osoby bez oslovení nebo příjmení se v\u00a0náhledu nezobrazí: 1.',
      'Prázdné nebo nepojmenované řádky se v\u00a0náhledu nezobrazí: 4.',
      'Neúplná vyjádření se v\u00a0náhledu nezobrazí: 3.',
    ]);
  });

  it('takes its words from the catalogue', () => {
    expect(previewNotices({ ...NONE, people: 5 })).toEqual([cs.points.preview.omittedPeople(5)]);
  });
});
