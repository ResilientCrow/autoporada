import { describe, expect, it } from 'vitest';

import type { ActionError } from '@/contracts';
import { cs } from '@/ui/copy';

import type { PointContentWire } from './fields';
import { issuesAfter, saveIssues } from './save-issues';

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
    expect(saveIssues({ 'content.endDate': 'invalid' }, content('2027-01-14'))).toEqual({
      messages: { endDate: 'Datum konce nesmí být před datem začátku.' },
      problem: null,
    });
    expect(points.editor.endBeforeStart).toBe('Datum konce nesmí být před datem začátku.');
  });

  it('asks for the start date when the end date stands alone', () => {
    expect(saveIssues({ 'content.endDate': 'invalid' }, content(null)).messages).toEqual({
      endDate: 'Vyplňte také datum začátku.',
    });
  });

  it('puts the body issue under the body, in the words of its code', () => {
    expect(saveIssues({ 'content.body': 'too-long' }, content(null)).messages).toEqual({
      body: fieldIssues['too-long'],
    });
    expect(saveIssues({ 'content.body': 'invalid' }, content(null)).messages).toEqual({
      body: fieldIssues.invalid,
    });
  });

  it('keeps every field of a spec that has one, without the content prefix', () => {
    const { messages, problem } = saveIssues(
      { 'content.title': 'too-long', 'content.place': 'too-long' },
      content(null),
    );
    expect(messages).toEqual({ title: fieldIssues['too-long'], place: fieldIssues['too-long'] });
    expect(problem).toBeNull();
  });

  it.each([['content'], ['content.bullets.0.label'], ['id'], ['content.opening'], ['toString']])(
    'turns the issue on %j, which no field of the editor shows, into a problem notice',
    (path) => {
      expect(saveIssues({ [path]: 'too-long' }, content(null))).toEqual({
        messages: {},
        problem: { code: 'invalid-input' },
      });
    },
  );

  it('turns an answer with no field at all into a problem notice', () => {
    expect(saveIssues({}, content(null))).toEqual({
      messages: {},
      problem: { code: 'invalid-input' },
    });
  });

  it('shows both a field and a problem together', () => {
    const out = saveIssues({ 'content.endDate': 'invalid', content: 'too-long' }, content(null));
    expect(Object.keys(out.messages)).toEqual(['endDate']);
    expect(out.problem).toEqual({ code: 'invalid-input' });
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
    { code: 'unavailable', requestId: 'req-1' },
    { code: 'rate-limited', retryAfterSeconds: 4 },
  ] as const)('keeps them through %j, which says nothing about the text', (error) => {
    expect(issuesAfter(FIELDS, fail(error))).toBe(FIELDS);
  });
});
