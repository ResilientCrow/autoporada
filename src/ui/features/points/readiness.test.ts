import { describe, expect, it } from 'vitest';

import type { BulletSpec, ProblemCode } from '@/domain/report';
import { cs } from '@/ui/copy';
import { fieldId } from '@/ui/form';

import { EDITOR_FORM_ID, editorSpec } from './editor-form';
import { readinessItems, readinessOf, readinessTarget } from './readiness';
import type { PointContentWire } from './fields';

const { points } = cs;

const SPEC: readonly BulletSpec[] = [
  { key: 'ucastnici', label: 'Účastníci', kind: 'people', required: true },
];
const EMPTY: PointContentWire = {
  title: '',
  eventDate: null,
  endDate: null,
  timeFrom: null,
  timeTo: null,
  campus: null,
  place: null,
  opening: '',
  openingEdited: false,
  body: { type: 'doc', content: [] },
  bullets: [{ key: 'ucastnici', label: 'Účastníci', kind: 'people', order: 'input', people: [] }],
  statements: [],
};
const form = (content: PointContentWire) =>
  editorSpec(content.bullets, SPEC, content.statements.length);
const idOf = (name: string) => fieldId(EDITOR_FORM_ID, name);

describe('readinessTarget', () => {
  const spec = form(EMPTY);
  it.each([
    ['content.title', 'title'],
    ['content.bullets.0.people', 'bullets.0.people'],
    ['content.bullets.0.people.2.familyName', 'bullets.0.people'],
    ['content.bullets.0.people.2.salutation', 'bullets.0.people'],
    ['content.bullets.0.people.1.affiliation', 'bullets.0.people'],
  ])('%s is the control %s', (path, name) => {
    expect(readinessTarget(path, spec)).toBe(name);
  });

  it.each(['content.bullets', 'content.statements', 'content.bullets.4.text', 'title'])(
    '%s has no control to link to',
    (path) => {
      expect(readinessTarget(path, spec)).toBeNull();
    },
  );
});

describe('readinessItems', () => {
  it('links each problem to its control in the order of the form, in the copy of its code', () => {
    const { problems, warnings } = readinessItems(
      readinessOf('report', EMPTY, SPEC, '2026/2027'),
      form(EMPTY),
    );
    expect(problems.map((p) => p.text)).toEqual([
      'Vyplňte název.',
      'Vyplňte datum začátku.',
      'Doplňte alespoň jednu osobu do řádku „Účastníci“.',
      'Úvodní věta nesmí být prázdná.',
      'Přidejte alespoň jedno vyjádření.',
    ]);
    expect(problems.map((p) => p.id)).toEqual([
      idOf('title'),
      idOf('eventDate'),
      idOf('bullets.0.people'),
      idOf('opening'),
      null,
    ]);
    expect(warnings).toEqual([]);
  });

  it('words the speaker who is no participant as a warning, with the neutral copy', () => {
    const content: PointContentWire = {
      ...EMPTY,
      statements: [
        {
          speaker: { givenName: 'Jana', familyName: 'Nováková', salutation: 'pani' },
          speakerGenitive: 'Jany Novákové',
          affiliation: '',
          quote: 'Ahoj',
        },
      ],
    };
    const { warnings } = readinessItems(
      readinessOf('report', content, SPEC, '2026/2027'),
      form(content),
    );
    expect(warnings).toEqual([
      { id: idOf('statements.0.speaker'), text: 'Mluvčí Jana Nováková není mezi účastníky.' },
    ]);
  });

  it('writes every problem code in Czech, with its parameters and no-break spaces', () => {
    const codes: Record<ProblemCode, Record<string, string | number | string[]>> = {
      'title-required': {},
      'body-required': {},
      'body-too-long': {},
      'event-date-required': {},
      'time-to-without-from': {},
      'time-to-before-from': {},
      'opening-required': {},
      'label-required': { n: 2 },
      'people-required': { label: 'Účastníci' },
      'text-required': { label: 'Výsledky' },
      'people-none': {},
      'person-name-required': { position: 3, label: 'Účastníci' },
      'salutation-required': { name: 'Jana Nováková' },
      'class-stale': { names: ['A', 'B'] },
      'statements-required': {},
      'speaker-required': { n: 1 },
      'genitive-required': { n: 1 },
      'quote-required': { n: 1 },
    };
    const text = (code: ProblemCode) => points.readiness.problem(code, codes[code]);
    expect(text('time-to-before-from')).toBe('Čas do musí být později než čas od.');
    expect(text('body-too-long')).toBe('Text je příliš dlouhý.');
    expect(text('person-name-required')).toBe(
      'Doplňte příjmení u osoby č.\u00a03 v\u00a0řádku „Účastníci“.',
    );
    expect(text('class-stale')).toBe('Ověřte třídu u osob: A, B.');
    expect(text('genitive-required')).toBe(
      'U vyjádření č.\u00a01 vyplňte jméno mluvčího ve 2.\u00a0pádě.',
    );
    for (const code of Object.keys(codes) as ProblemCode[])
      expect(text(code)).not.toMatch(/undefined|\[object/);
  });

  // Design section 6 word for word, with the typography rule applied (no-break spaces after
  // „č.“, „v“ and „2.“). Two lines differ from the design on purpose: equal times are refused
  // (the snapshot does), and a speaker picked through „Jiná osoba…“ never was a participant.
  const PINNED: Record<ProblemCode, [Record<string, string | number | string[]>, string]> = {
    'title-required': [{}, 'Vyplňte název.'],
    'event-date-required': [{}, 'Vyplňte datum začátku.'],
    'opening-required': [{}, 'Úvodní věta nesmí být prázdná.'],
    'body-required': [{}, 'Vyplňte text návrhu.'],
    'body-too-long': [{}, 'Text je příliš dlouhý.'],
    'time-to-without-from': [{}, 'Vyplňte také čas od.'],
    'time-to-before-from': [{}, 'Čas do musí být později než čas od.'],
    'label-required': [{ n: 2 }, 'Pojmenujte řádek č.\u00a02.'],
    'people-required': [
      { label: 'Účastníci' },
      'Doplňte alespoň jednu osobu do řádku „Účastníci“.',
    ],
    'people-none': [{}, 'Doplňte alespoň jednu osobu.'],
    'text-required': [{ label: 'Výsledky' }, 'Vyplňte řádek „Výsledky“.'],
    'person-name-required': [
      { position: 3, label: 'Účastníci' },
      'Doplňte příjmení u osoby č.\u00a03 v\u00a0řádku „Účastníci“.',
    ],
    'salutation-required': [{ name: 'Jana Nováková' }, 'U osoby Jana Nováková zvolte oslovení.'],
    'class-stale': [{ names: ['A', 'B'] }, 'Ověřte třídu u osob: A, B.'],
    'statements-required': [{}, 'Přidejte alespoň jedno vyjádření.'],
    'speaker-required': [{ n: 1 }, 'U vyjádření č.\u00a01 zvolte, kdo mluví.'],
    'genitive-required': [
      { n: 1 },
      'U vyjádření č.\u00a01 vyplňte jméno mluvčího ve 2.\u00a0pádě.',
    ],
    'quote-required': [{ n: 1 }, 'U vyjádření č.\u00a01 vyplňte citaci.'],
  };
  it.each(Object.entries(PINNED) as [ProblemCode, (typeof PINNED)[ProblemCode]][])(
    '%s reads exactly as its copy',
    (code, [params, text]) => {
      expect(points.readiness.problem(code, params)).toBe(text);
    },
  );

  it('warns about a speaker who is no participant in the neutral wording', () => {
    expect(points.readiness.warning('speaker-not-participant', { name: 'Jana Nováková' })).toBe(
      'Mluvčí Jana Nováková není mezi účastníky.',
    );
  });
});
