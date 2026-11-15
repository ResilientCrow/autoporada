import { describe, expect, it } from 'vitest';

import { emptyRichDoc } from '@/domain/richtext';

import { DRAFT_CAP, newDraft, type BulletSpec } from './index';

const ORGANISERS: BulletSpec = {
  key: 'organisers',
  label: 'Organizátoři',
  kind: 'people',
  required: true,
};
const RESULTS: BulletSpec = { key: 'results', label: 'Výsledky', kind: 'text', required: false };

describe('newDraft', () => {
  it('starts every field empty', () => {
    expect(newDraft([])).toEqual({
      title: '',
      eventDate: null,
      endDate: null,
      timeFrom: null,
      timeTo: null,
      campus: null,
      place: null,
      opening: '',
      openingEdited: false,
      body: emptyRichDoc(),
      bullets: [],
      statements: [],
    });
  });

  it('copies the type’s bullets in order, people in input order and text empty', () => {
    expect(newDraft([ORGANISERS, RESULTS]).bullets).toEqual([
      { key: 'organisers', label: 'Organizátoři', kind: 'people', order: 'input', people: [] },
      { key: 'results', label: 'Výsledky', kind: 'text', text: '' },
    ]);
  });

  it('gives each draft its own body and lists', () => {
    const a = newDraft([RESULTS]);
    const b = newDraft([RESULTS]);
    expect(a.body).not.toBe(b.body);
    expect(a.bullets).not.toBe(b.bullets);
  });
});

describe('DRAFT_CAP', () => {
  it('pins the open drafts an author may hold (design section 6)', () => {
    expect(DRAFT_CAP).toBe(50);
  });
});
