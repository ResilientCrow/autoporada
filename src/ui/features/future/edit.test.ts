import { describe, expect, it } from 'vitest';

import type { ActionError } from '@/contracts';
import { cs } from '@/ui/copy';

import {
  FUTURE_SPEC,
  issuesOf,
  messagesOf,
  patchFor,
  refusedAfter,
  sameContent,
  startEdit,
  withPatch,
  type FutureContentWire,
} from './edit';

const content = (patch: Partial<FutureContentWire> = {}): FutureContentWire => ({
  title: '',
  startDate: null,
  endDate: null,
  timeFrom: null,
  timeTo: null,
  campus: null,
  place: null,
  organizer: null,
  participants: null,
  note: null,
  responsible: null,
  ...patch,
});

describe('startEdit', () => {
  it('holds the content as it was loaded', () => {
    const loaded = content({ title: 'Lyžák', organizer: 'organizuje pan Malý' });
    expect(startEdit(loaded).content).toBe(loaded);
  });
});

describe('changes', () => {
  const edit = startEdit(content({ startDate: '2027-01-14', timeFrom: '08:00' }));

  it.each([
    ['title', 'Lyžák', { title: 'Lyžák' }],
    ['place', '', { place: null }],
    ['place', 'S206', { place: 'S206' }],
    ['campus', 'radlice', { campus: 'radlice' }],
    ['campus', 'nikde', { campus: null }],
    ['organizer', 'organizuje pan Malý', { organizer: 'organizuje pan Malý' }],
    ['participants', '', { participants: null }],
    ['note', 'téma stáže', { note: 'téma stáže' }],
    ['startDate', '2027-02-01', { startDate: '2027-02-01', endDate: null }],
    ['startDate', '', { startDate: null, endDate: null }],
    ['timeTo', '10:30', { timeTo: '10:30' }],
  ] as const)('%s %j patches %j', (name, value, patch) => {
    expect(patchFor(name, value, edit.content)).toEqual(patch);
  });

  it('keeps the old date while a year is half typed', () => {
    expect(patchFor('startDate', '0020-01-14', edit.content)).toEqual({
      startDate: '2027-01-14',
      endDate: null,
    });
    expect(patchFor('timeFrom', '8:00', edit.content)).toEqual({ timeFrom: '08:00' });
  });

  it('applies a patch without touching the edit it was given', () => {
    const next = withPatch(edit, { title: 'Nový' });
    expect(next.content.title).toBe('Nový');
    expect(edit.content.title).toBe('');
  });

  it('clears the times when the end moves past the start', () => {
    expect(patchFor('endDate', '2027-01-16', edit.content)).toEqual({
      startDate: '2027-01-14',
      endDate: '2027-01-16',
      timeFrom: null,
      timeTo: null,
    });
  });
});

describe('FUTURE_SPEC', () => {
  it('asks for a title and a start date, and has no report box: every akce owes one', () => {
    expect(FUTURE_SPEC['title']?.required).toBe(true);
    expect(FUTURE_SPEC['startDate']?.required).toBe(true);
    expect(Object.keys(FUTURE_SPEC)).not.toContain('expectsReport');
  });
});

describe('issuesOf', () => {
  it('names the fields the editor has, without the content prefix', () => {
    expect(issuesOf({ 'content.title': 'required', 'content.timeTo': 'invalid' })).toEqual({
      known: { title: 'required', timeTo: 'invalid' },
      unknown: false,
    });
  });

  it('reports a path no field of this editor carries', () => {
    expect(issuesOf({ 'content.expectsReport': 'invalid' })).toEqual({
      known: {},
      unknown: true,
    });
    expect(issuesOf({ content: 'too-long' })).toEqual({ known: {}, unknown: true });
  });
});

describe('messagesOf', () => {
  it('explains an end date by whether there is a start', () => {
    expect(messagesOf({ endDate: 'invalid' }, content({ startDate: '2027-01-14' }))).toEqual({
      endDate: cs.future.editor.endBeforeStart,
    });
    expect(messagesOf({ endDate: 'invalid' }, content())).toEqual({
      endDate: cs.future.editor.endWithoutStart,
    });
  });

  it('says a time to needs to be later, and other fields what their code says', () => {
    expect(messagesOf({ timeTo: 'invalid', title: 'too-long' }, content())).toEqual({
      timeTo: cs.future.editor.timeTo,
      title: cs.fieldIssues['too-long'],
    });
  });
});

describe('refusedAfter', () => {
  const refused = { code: 'invalid-input', fields: { 'content.title': 'too-long' } } as const;
  const fail = (error: ActionError) => ({ ok: false, error }) as const;
  const before = { 'content.endDate': 'invalid' } as const;

  it('takes the newest refusal, clears on a saved answer, and ignores everything else', () => {
    expect(refusedAfter(before, fail(refused))).toEqual({ 'content.title': 'too-long' });
    expect(refusedAfter(before, { ok: true, data: { version: 2 } })).toBeNull();
    expect(refusedAfter(before, fail({ code: 'conflict' }))).toBe(before);
  });
});

describe('sameContent', () => {
  it('is true for equal content, however it was built', () => {
    const a = content({ title: 'Lyžák', note: 'téma' });
    const b = content({ title: 'Lyžák', note: 'téma' });
    expect(sameContent(a, b)).toBe(true);
  });

  it('is false for any changed field', () => {
    expect(sameContent(content(), content({ place: 'S206' }))).toBe(false);
  });
});
