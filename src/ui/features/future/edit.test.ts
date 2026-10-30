import { describe, expect, it } from 'vitest';

import type { ActionError } from '@/contracts';
import { cs } from '@/ui/copy';

import {
  futureSpec,
  issuesOf,
  messagesOf,
  patchFor,
  refusedAfter,
  responsibleWire,
  sameContent,
  startEdit,
  withPatch,
  withResponsible,
  type FutureContentWire,
} from './edit';

const person = { salutation: 'pani', givenName: 'Jana', familyName: 'Nováková' } as const;

const content = (patch: Partial<FutureContentWire> = {}): FutureContentWire => ({
  title: '',
  startDate: null,
  endDate: null,
  timeFrom: null,
  timeTo: null,
  campus: null,
  place: null,
  responsible: null,
  expectsReport: false,
  ...patch,
});

describe('startEdit', () => {
  it('holds an item with no one responsible as an empty draft with the first verb', () => {
    expect(startEdit(content()).responsible).toEqual({
      verb: 'organizuje',
      behalfOf: '',
      people: [],
    });
  });

  it('keys each person by its place, so the server render and the browser agree', () => {
    const edit = startEdit(
      content({
        responsible: {
          verb: 'vede',
          behalfOf: '8.A',
          people: [person, { ...person, givenName: 'Eva' }],
        },
      }),
    );
    expect(edit.responsible.verb).toBe('vede');
    expect(edit.responsible.behalfOf).toBe('8.A');
    expect(edit.responsible.people.map((chip) => chip.key)).toEqual(['r.0', 'r.1']);
  });
});

describe('responsibleWire', () => {
  it('is null while no one is named', () => {
    expect(responsibleWire({ verb: 'vede', behalfOf: '', people: [] })).toBeNull();
  });

  it('leaves out a behalf-of that was not typed', () => {
    expect(
      responsibleWire({ verb: 'vede', behalfOf: '', people: [{ key: 'r.0', person }] }),
    ).toEqual({ verb: 'vede', people: [person] });
  });

  it('keeps a behalf-of with no people, so the submit can ask for them', () => {
    expect(responsibleWire({ verb: 'vede', behalfOf: '8.A', people: [] })).toEqual({
      verb: 'vede',
      behalfOf: '8.A',
      people: [],
    });
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
    ['startDate', '2027-02-01', { startDate: '2027-02-01' }],
    ['startDate', '', { startDate: null }],
    ['timeTo', '10:30', { timeTo: '10:30' }],
  ] as const)('%s %j patches %j', (name, value, patch) => {
    expect(patchFor(name, value, edit.content)).toEqual(patch);
  });

  it('keeps the old date while a year is half typed', () => {
    expect(patchFor('startDate', '0020-01-14', edit.content)).toEqual({ startDate: '2027-01-14' });
    expect(patchFor('timeFrom', '8:00', edit.content)).toEqual({ timeFrom: '08:00' });
  });

  it('applies a patch without touching the edit it was given', () => {
    const next = withPatch(edit, { title: 'Nový' });
    expect(next.content.title).toBe('Nový');
    expect(edit.content.title).toBe('');
    expect(next.responsible).toBe(edit.responsible);
  });

  it('puts the people into the content they are saved from', () => {
    const next = withResponsible(edit, { people: [{ key: 'r.0', person }] });
    expect(next.content.responsible).toEqual({ verb: 'organizuje', people: [person] });
    expect(next.responsible.people).toHaveLength(1);
    const cleared = withResponsible(next, { people: [] });
    expect(cleared.content.responsible).toBeNull();
  });
});

describe('futureSpec', () => {
  it('asks for a title and a start date, and for the report box only on an akce', () => {
    expect(futureSpec('akce')['title']?.required).toBe(true);
    expect(futureSpec('akce')['startDate']?.required).toBe(true);
    expect(Object.keys(futureSpec('akce'))).toContain('expectsReport');
    expect(Object.keys(futureSpec('jednani'))).not.toContain('expectsReport');
  });
});

describe('futureSpec', () => {
  it('words the refusal of an expectsReport that was cleared too late', () => {
    expect(futureSpec('akce')['expectsReport']?.messages?.invalid).toBe(
      cs.future.editor.expectsReportSettled,
    );
  });
});

describe('issuesOf', () => {
  it('names the fields the editor has, without the content prefix', () => {
    expect(issuesOf({ 'content.title': 'required', 'content.timeTo': 'invalid' }, 'akce')).toEqual({
      known: { title: 'required', timeTo: 'invalid' },
      unknown: false,
    });
  });

  it('folds a person’s missing part into the people field', () => {
    expect(issuesOf({ 'content.responsible.people.1.salutation': 'required' }, 'akce')).toEqual({
      known: { 'responsible.people': 'required' },
      unknown: false,
    });
  });

  it('reports a path no field of this editor carries', () => {
    expect(issuesOf({ 'content.expectsReport': 'invalid' }, 'jednani')).toEqual({
      known: {},
      unknown: true,
    });
    expect(issuesOf({ content: 'too-long' }, 'akce')).toEqual({ known: {}, unknown: true });
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

  it('says a settled report cannot stop being expected', () => {
    expect(messagesOf({ expectsReport: 'invalid' }, content())).toEqual({
      expectsReport: cs.future.editor.expectsReportSettled,
    });
  });

  it('says too many people for a people list that is over its cap', () => {
    expect(messagesOf({ 'responsible.people': 'too-long' }, content())).toEqual({
      'responsible.people': cs.future.editor.tooMany,
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
    const people = [{ salutation: 'pani', givenName: 'Jana', familyName: 'Nováková' } as const];
    const a = content({ title: 'Lyžák', responsible: { verb: 'vede', people } });
    const b = content({ title: 'Lyžák', responsible: { verb: 'vede', people: [...people] } });
    expect(sameContent(a, b)).toBe(true);
  });

  it('is false for any changed field', () => {
    expect(sameContent(content(), content({ place: 'S206' }))).toBe(false);
    expect(sameContent(content(), content({ expectsReport: true }))).toBe(false);
  });

  it('ignores a verb picked while nobody is responsible: nothing is saved for it', () => {
    const edit = startEdit(content());
    expect(sameContent(edit.content, withResponsible(edit, { verb: 'vede' }).content)).toBe(true);
  });
});
