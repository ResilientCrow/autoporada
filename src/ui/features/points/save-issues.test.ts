import { describe, expect, it } from 'vitest';

import type { ActionError } from '@/contracts';
import type { BulletSpec } from '@/domain/report';
import { cs } from '@/ui/copy';

import type { PointContentWire } from './fields';
import { issuesAfter, issuesAfterRows, issuesAfterStatementRows, saveIssues } from './save-issues';

const { points, fieldIssues } = cs;

const content = (eventDate: string | null): PointContentWire => ({
  title: 'Exkurze',
  eventDate,
  endDate: '2027-01-10',
  timeFrom: null,
  timeTo: null,
  campus: null,
  place: null,
  opening: '',
  openingEdited: false,
  body: { type: 'doc', content: [] },
  bullets: [],
  statements: [],
});

describe('saveIssues', () => {
  it('says the end date is before the start when there is a start', () => {
    expect(saveIssues({ 'content.endDate': 'invalid' }, content('2027-01-14'), [])).toEqual({
      messages: { endDate: 'Datum konce nesmí být před datem začátku.' },
      problem: null,
      notice: null,
    });
    expect(points.editor.endBeforeStart).toBe('Datum konce nesmí být před datem začátku.');
  });

  it('asks for the start date when the end date stands alone', () => {
    expect(saveIssues({ 'content.endDate': 'invalid' }, content(null), []).messages).toEqual({
      endDate: 'Vyplňte také datum začátku.',
    });
  });

  it('puts the body issue under the body, in the words of its code', () => {
    expect(saveIssues({ 'content.body': 'too-long' }, content(null), []).messages).toEqual({
      body: fieldIssues['too-long'],
    });
    expect(saveIssues({ 'content.body': 'invalid' }, content(null), []).messages).toEqual({
      body: fieldIssues.invalid,
    });
  });

  it('puts the opening sentence’s issue under the opening sentence', () => {
    const out = saveIssues({ 'content.opening': 'too-long' }, content(null), []);
    expect(out.messages).toEqual({ opening: fieldIssues['too-long'] });
    expect(out.problem).toBeNull();
  });

  it('keeps every field of a spec that has one, without the content prefix', () => {
    const { messages, problem } = saveIssues(
      { 'content.title': 'too-long', 'content.place': 'too-long' },
      content(null),
      [],
    );
    expect(messages).toEqual({ title: fieldIssues['too-long'], place: fieldIssues['too-long'] });
    expect(problem).toBeNull();
  });

  it.each([['content.bullets.0.label'], ['id'], ['toString']])(
    'turns the issue on %j, which no field of the editor shows, into a problem notice',
    (path) => {
      expect(saveIssues({ [path]: 'too-long' }, content(null), [])).toEqual({
        messages: {},
        problem: { code: 'invalid-input' },
        notice: null,
      });
    },
  );

  it('turns an answer with no field at all into a problem notice', () => {
    expect(saveIssues({}, content(null), [])).toEqual({
      messages: {},
      problem: { code: 'invalid-input' },
      notice: null,
    });
  });

  it('shows both a field and a problem together', () => {
    const out = saveIssues({ 'content.endDate': 'invalid', content: 'invalid' }, content(null), []);
    expect(Object.keys(out.messages)).toEqual(['endDate']);
    expect(out.problem).toEqual({ code: 'invalid-input' });
  });
});

describe('saveIssues for the bullets', () => {
  const SPEC: readonly BulletSpec[] = [
    { key: 'ucastnici', label: 'Účastníci', kind: 'people', required: true },
    { key: 'vysledky', label: 'Výsledky', kind: 'text', required: false },
  ];
  const withBullets = (): PointContentWire => ({
    ...content(null),
    bullets: [
      { key: 'ucastnici', label: 'Účastníci', kind: 'people', order: 'input', people: [] },
      { key: 'vysledky', label: 'Výsledky', kind: 'text', text: '' },
      { key: 'custom-1', label: '', kind: 'text', text: '' },
    ],
  });

  it('puts the issue of a bullet under its own control', () => {
    const out = saveIssues(
      {
        'content.bullets.1.text': 'too-long',
        'content.bullets.2.label': 'too-long',
      },
      withBullets(),
      SPEC,
    );
    expect(out.messages).toEqual({
      'bullets.1.text': fieldIssues['too-long'],
      'bullets.2.label': fieldIssues['too-long'],
    });
    expect(out.problem).toBeNull();
    expect(out.notice).toBeNull();
  });

  it('says a people row the save refuses has too many people', () => {
    const out = saveIssues({ 'content.bullets.0.people': 'too-long' }, withBullets(), SPEC);
    expect(out.messages).toEqual({ 'bullets.0.people': points.bullets.tooManyPeople });
    expect(
      saveIssues({ 'content.bullets.0.people': 'invalid' }, withBullets(), SPEC).messages,
    ).toEqual({
      'bullets.0.people': points.bullets.tooManyPeople,
    });
  });

  it('says a required people row left empty is required (a review edit’s readiness)', () => {
    const out = saveIssues(
      { 'content.title': 'required', 'content.bullets.0.people': 'required' },
      withBullets(),
      SPEC,
    );
    expect(out).toEqual({
      messages: { title: fieldIssues.required, 'bullets.0.people': fieldIssues.required },
      problem: null,
      notice: null,
    });
  });

  it.each([
    ['content.bullets.3.text'],
    ['content.bullets.0.text'],
    ['content.bullets.0.people.2.givenName'],
  ])(
    'sends the issue on %j, which names no control of these bullets, to the problem notice',
    (path) => {
      expect(saveIssues({ [path]: 'too-long' }, withBullets(), SPEC)).toEqual({
        messages: {},
        problem: { code: 'invalid-input' },
        notice: null,
      });
    },
  );
});

describe('saveIssues for the content as a whole', () => {
  it('says the point is too long in its own words, not the generic one about characters', () => {
    const out = saveIssues({ content: 'too-long' }, content(null), []);
    expect(out).toEqual({ messages: {}, problem: null, notice: points.editor.tooLong });
    expect(points.editor.tooLong).not.toContain('znaky');
  });

  it('keeps the generic notice for any other content-wide code', () => {
    expect(saveIssues({ content: 'invalid' }, content(null), [])).toEqual({
      messages: {},
      problem: { code: 'invalid-input' },
      notice: null,
    });
  });

  it('shows it beside the issues of fields', () => {
    const out = saveIssues({ content: 'too-long', 'content.title': 'too-long' }, content(null), []);
    expect(out.notice).toBe(points.editor.tooLong);
    expect(Object.keys(out.messages)).toEqual(['title']);
    expect(out.problem).toBeNull();
  });
});

describe('issuesAfter', () => {
  const FIELDS = { 'content.endDate': 'invalid' } as const;
  const fail = (error: ActionError) => ({ ok: false, error }) as const;

  it('keeps the issues of an invalid answer', () => {
    expect(issuesAfter(null, fail({ code: 'invalid-input', fields: FIELDS }))).toEqual(FIELDS);
  });

  it('replaces older issues with the newest', () => {
    const next = { 'content.body': 'too-long' } as const;
    expect(issuesAfter(FIELDS, fail({ code: 'invalid-input', fields: next }))).toEqual(next);
  });

  it('clears them on a saved answer', () => {
    expect(issuesAfter(FIELDS, { ok: true, data: { version: 4 } })).toBeNull();
  });

  it.each([
    { code: 'conflict' },
    { code: 'unavailable', cause: 'database-down' },
    { code: 'rate-limited', retryAfterSeconds: 4 },
  ] as const)('keeps them through %j, which says nothing about the text', (error) => {
    expect(issuesAfter(FIELDS, fail(error))).toBe(FIELDS);
  });
});

describe('issuesAfterRows', () => {
  const rows = (...keys: string[]) => keys.map((key) => ({ key }));
  const FIELDS = {
    'content.endDate': 'invalid',
    'content.bullets.2.text': 'too-long',
    'content.bullets.1.people': 'too-long',
  } as const;

  it('is null while nothing was refused', () => {
    expect(issuesAfterRows(null, rows('a'), rows('a', 'b'))).toBeNull();
  });

  it('drops the issues of bullets when a row is added, and keeps the others', () => {
    expect(issuesAfterRows(FIELDS, rows('a', 'b', 'c'), rows('a', 'b', 'c', 'd'))).toEqual({
      'content.endDate': 'invalid',
    });
  });

  it('drops them when a row is removed or restored', () => {
    expect(issuesAfterRows(FIELDS, rows('a', 'b', 'c'), rows('a', 'c'))).toEqual({
      'content.endDate': 'invalid',
    });
    expect(issuesAfterRows(FIELDS, rows('a', 'c'), rows('a', 'b', 'c'))).toEqual({
      'content.endDate': 'invalid',
    });
  });

  it('drops them when a row is swapped for another of the same count', () => {
    expect(issuesAfterRows(FIELDS, rows('a', 'b'), rows('a', 'c'))).toEqual({
      'content.endDate': 'invalid',
    });
  });

  it('keeps them through an edit inside a row, which moves no index', () => {
    expect(issuesAfterRows(FIELDS, rows('a', 'b', 'c'), rows('a', 'b', 'c'))).toBe(FIELDS);
  });

  it('keeps the content-wide and the other issues when rows change', () => {
    const other = { content: 'too-long', 'content.title': 'too-long' } as const;
    expect(issuesAfterRows(other, rows('a'), rows('a', 'b'))).toBe(other);
  });

  it('becomes null when only bullet issues were there, not an empty set that reads as a fault', () => {
    expect(
      issuesAfterRows({ 'content.bullets.0.people': 'too-long' }, rows('a'), rows()),
    ).toBeNull();
  });
});

describe('saveIssues for the statements', () => {
  const withStatements = (): PointContentWire => ({
    ...content(null),
    statements: [
      { speaker: null, speakerGenitive: '', quote: '' },
      { speaker: null, speakerGenitive: '', quote: '' },
    ],
  });

  it('puts the issue of a statement’s field under that field', () => {
    const out = saveIssues(
      {
        'content.statements.0.quote': 'too-long',
        'content.statements.1.speakerGenitive': 'too-long',
        'content.statements.1.affiliation': 'too-long',
      },
      withStatements(),
      [],
    );
    expect(out.messages).toEqual({
      'statements.0.quote': fieldIssues['too-long'],
      'statements.1.speakerGenitive': fieldIssues['too-long'],
      'statements.1.affiliation': fieldIssues['too-long'],
    });
    expect(out.problem).toBeNull();
  });

  it.each([['content.statements.2.quote'], ['content.statements.0.speaker.givenName']])(
    'sends the issue on %j, which names no control, to the problem notice',
    (path) => {
      expect(saveIssues({ [path]: 'too-long' }, withStatements(), [])).toEqual({
        messages: {},
        problem: { code: 'invalid-input' },
        notice: null,
      });
    },
  );
});

describe('issuesAfterStatementRows', () => {
  const FIELDS = {
    'content.endDate': 'invalid',
    'content.statements.0.quote': 'too-long',
    'content.statements.1.speakerGenitive': 'too-long',
  } as const;

  it('is null while nothing was refused', () => {
    expect(issuesAfterStatementRows(null)).toBeNull();
  });

  it('drops the issues of the statements, which name them by place, and keeps the others', () => {
    expect(issuesAfterStatementRows(FIELDS)).toEqual({ 'content.endDate': 'invalid' });
  });

  it('keeps the very issues when none names a statement', () => {
    const other = { content: 'too-long', 'content.bullets.0.text': 'too-long' } as const;
    expect(issuesAfterStatementRows(other)).toBe(other);
  });

  it('becomes null when only statement issues were there', () => {
    expect(issuesAfterStatementRows({ 'content.statements.0.quote': 'too-long' })).toBeNull();
  });
});
