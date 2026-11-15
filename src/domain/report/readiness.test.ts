import { describe, expect, it } from 'vitest';

import type { Salutation } from '@/domain/cs';
import { emptyRichDoc, LIMITS, richDocFromText, type RichDoc } from '@/domain/richtext';
import { parseIsoDate as d, parseWallTime as t } from '@/domain/time';

import {
  missingForSubmit,
  submittedContent,
  type BulletSpec,
  type DraftBullet,
  type DraftPerson,
  type DraftStatement,
  type PointContent,
} from './index';

const YEAR = '2026/2027';
/** A day in YEAR after every event date below: readiness takes today and counts the school year from it. */
const TODAY = d('2026-11-13');

function person(
  givenName: string,
  familyName: string,
  salutation: Salutation | null = 'pan',
  extra: Partial<DraftPerson> = {},
): DraftPerson {
  return { salutation, givenName, familyName, affiliation: '3.B', affiliationYear: YEAR, ...extra };
}

const jan = person('Jan', 'Novák');
const eva = person('Eva', 'Malá', 'slecna');
const petra = person('Petra', 'Dvořáková', 'pani');

const peopleBullet = (key: string, people: readonly DraftPerson[]): DraftBullet => ({
  key,
  label: key === 'organisers' ? 'Organizátoři' : 'Účastníci',
  kind: 'people',
  order: 'input',
  people,
});
const textBullet = (key: string, text: string): DraftBullet => ({
  key,
  label: 'Výsledky',
  kind: 'text',
  text,
});
const statement = (over: Partial<DraftStatement> = {}): DraftStatement => ({
  speaker: jan,
  speakerGenitive: 'pana Nováka',
  quote: 'Bylo to skvělé.',
  ...over,
});

const ORGANISERS: BulletSpec = {
  key: 'organisers',
  label: 'Organizátoři',
  kind: 'people',
  required: false,
};
const PARTICIPANTS: BulletSpec = {
  key: 'participants',
  label: 'Účastníci',
  kind: 'people',
  required: true,
};
const RESULTS: BulletSpec = { key: 'results', label: 'Výsledky', kind: 'text', required: false };
const SPEC = [ORGANISERS, PARTICIPANTS, RESULTS] as const;

const ready: PointContent = {
  title: 'Vesmírný seminář',
  eventDate: d('2026-10-14'),
  endDate: null,
  timeFrom: t('10:00'),
  timeTo: t('12:00'),
  campus: 'smichov',
  place: null,
  opening: 'Ve středu proběhl seminář.',
  openingEdited: false,
  body: emptyRichDoc(),
  bullets: [peopleBullet('organisers', [eva]), peopleBullet('participants', [jan, petra])],
  statements: [statement()],
};

const check = (content: PointContent, spec: readonly BulletSpec[] = SPEC) =>
  missingForSubmit('report', content, spec, TODAY);
const withBullets = (...bullets: DraftBullet[]): PointContent => ({ ...ready, bullets });

describe('missingForSubmit: report', () => {
  it('passes a complete report with no problem and no warning', () => {
    expect(check(ready)).toEqual({ problems: [], warnings: [] });
  });

  it('passes a complete report with no spec bullets at all', () => {
    expect(check(withBullets(peopleBullet('guests', [jan])), [])).toEqual({
      problems: [],
      warnings: [],
    });
  });

  const cases: readonly (readonly [string, PointContent, object])[] = [
    [
      'blank title',
      { ...ready, title: '  \u00a0 ' },
      { code: 'title-required', path: 'content.title', params: {} },
    ],
    [
      'no event date',
      { ...ready, eventDate: null },
      { code: 'event-date-required', path: 'content.eventDate', params: {} },
    ],
    [
      'time to without time from',
      { ...ready, timeFrom: null },
      { code: 'time-to-without-from', path: 'content.timeTo', params: {} },
    ],
    [
      'time to before time from on a one-day event',
      { ...ready, timeFrom: t('12:00'), timeTo: t('10:00') },
      { code: 'time-to-before-from', path: 'content.timeTo', params: {} },
    ],
    [
      'time to equal to time from on a one-day event, which the snapshot refuses',
      { ...ready, timeFrom: t('10:00'), timeTo: t('10:00') },
      { code: 'time-to-before-from', path: 'content.timeTo', params: {} },
    ],
    [
      'time to equal to time from when the end date equals the start',
      { ...ready, endDate: d('2026-10-14'), timeFrom: t('10:00'), timeTo: t('10:00') },
      { code: 'time-to-before-from', path: 'content.timeTo', params: {} },
    ],
    [
      'time to before time from when the end date equals the start',
      { ...ready, endDate: d('2026-10-14'), timeFrom: t('12:00'), timeTo: t('10:00') },
      { code: 'time-to-before-from', path: 'content.timeTo', params: {} },
    ],
    [
      'blank opening',
      { ...ready, opening: ' \n ' },
      { code: 'opening-required', path: 'content.opening', params: {} },
    ],
    [
      'required people bullet without a person',
      withBullets(peopleBullet('organisers', [eva]), peopleBullet('participants', [])),
      { code: 'people-required', path: 'content.bullets.1.people', params: { label: 'Účastníci' } },
    ],
    [
      'required people bullet the author removed',
      withBullets(peopleBullet('organisers', [eva])),
      { code: 'people-required', path: 'content.bullets', params: { label: 'Účastníci' } },
    ],
    [
      'a person without a salutation',
      withBullets(peopleBullet('participants', [jan, person('Karel', 'Bez', null)])),
      {
        code: 'salutation-required',
        path: 'content.bullets.0.people.1.salutation',
        params: { name: 'Karel Bez' },
      },
    ],
    [
      'a person with a blank family name',
      withBullets(peopleBullet('participants', [jan, person('Karel', ' ')])),
      {
        code: 'person-name-required',
        path: 'content.bullets.0.people.1.familyName',
        params: { position: 2, label: 'Účastníci' },
      },
    ],
    [
      'a nameless organiser, named with its own bullet',
      withBullets(
        peopleBullet('organisers', [person('Karel', '')]),
        peopleBullet('participants', [jan]),
      ),
      {
        code: 'person-name-required',
        path: 'content.bullets.0.people.0.familyName',
        params: { position: 1, label: 'Organizátoři' },
      },
    ],
    [
      'a nameless person with a blank salutation, which needs the name first',
      withBullets(peopleBullet('participants', [jan, person('Karel', ' ', null)])),
      {
        code: 'person-name-required',
        path: 'content.bullets.0.people.1.familyName',
        params: { position: 2, label: 'Účastníci' },
      },
    ],
    [
      'a nameless person whose class is stale, which waits for the name',
      withBullets(
        peopleBullet('participants', [
          jan,
          person('Karel', '', 'pan', { affiliationYear: '2025/2026' }),
        ]),
      ),
      {
        code: 'person-name-required',
        path: 'content.bullets.0.people.1.familyName',
        params: { position: 2, label: 'Účastníci' },
      },
    ],
    [
      'a nameless person whose class is unconfirmed',
      withBullets(
        peopleBullet('participants', [
          jan,
          person('Karel', ' ', 'pan', { affiliationYear: undefined }),
        ]),
      ),
      {
        code: 'person-name-required',
        path: 'content.bullets.0.people.1.familyName',
        params: { position: 2, label: 'Účastníci' },
      },
    ],
    [
      'a class confirmed in another school year',
      withBullets(
        peopleBullet('participants', [
          jan,
          person('Ivo', 'Starý', 'pan', { affiliationYear: '2025/2026' }),
        ]),
      ),
      {
        code: 'class-stale',
        path: 'content.bullets.0.people.1.affiliation',
        params: { names: ['Ivo Starý'] },
      },
    ],
    [
      'a class with no confirmed year',
      withBullets(
        peopleBullet('participants', [
          person('Ivo', 'Starý', 'pan', { affiliationYear: undefined }),
        ]),
      ),
      {
        code: 'class-stale',
        path: 'content.bullets.0.people.0.affiliation',
        params: { names: ['Ivo Starý'] },
      },
    ],
    [
      'no statement',
      { ...ready, statements: [] },
      { code: 'statements-required', path: 'content.statements', params: {} },
    ],
    [
      'a statement without a speaker',
      { ...ready, statements: [statement(), statement({ speaker: null })] },
      { code: 'speaker-required', path: 'content.statements.1.speaker', params: { n: 2 } },
    ],
    [
      'a statement with a blank genitive',
      { ...ready, statements: [statement({ speakerGenitive: ' ' })] },
      { code: 'genitive-required', path: 'content.statements.0.speakerGenitive', params: { n: 1 } },
    ],
    [
      'a statement with a blank quote',
      { ...ready, statements: [statement({ quote: ' \n' })] },
      { code: 'quote-required', path: 'content.statements.0.quote', params: { n: 1 } },
    ],
  ];

  it.each(cases)('reports %s, and only that', (_name, content, problem) => {
    expect(check(content).problems).toEqual([problem]);
  });

  it('names the required bullet, not a general gap, when nobody is listed anywhere', () => {
    const content = withBullets(peopleBullet('organisers', []), peopleBullet('participants', []));
    expect(check(content).problems.map((p) => p.code)).toEqual(['people-required']);
    expect(check(withBullets()).problems.map((p) => p.code)).toEqual(['people-required']);
  });

  it('reports no person at all on content.bullets when no required bullet names the gap', () => {
    const content = withBullets(peopleBullet('organisers', []));
    expect(check(content, [ORGANISERS]).problems).toEqual([
      { code: 'people-none', path: 'content.bullets', params: {} },
    ]);
  });

  it('reports a required text bullet with blank text on its field', () => {
    const spec = [PARTICIPANTS, { ...RESULTS, required: true }];
    const content = withBullets(peopleBullet('participants', [jan]), textBullet('results', ' '));
    expect(check(content, spec).problems).toEqual([
      { code: 'text-required', path: 'content.bullets.1.text', params: { label: 'Výsledky' } },
    ]);
  });

  it('reports a removed required text bullet on content.bullets', () => {
    const spec = [PARTICIPANTS, { ...RESULTS, required: true }];
    const content = withBullets(peopleBullet('participants', [jan]));
    expect(check(content, spec).problems).toEqual([
      { code: 'text-required', path: 'content.bullets', params: { label: 'Výsledky' } },
    ]);
  });

  it('does not ask for an optional bullet, a custom bullet or a one-day time check on a multi-day event', () => {
    const content: PointContent = {
      ...withBullets(
        peopleBullet('participants', [jan]),
        textBullet('results', ''),
        peopleBullet('guests', []),
        textBullet('custom', '   '),
      ),
      endDate: d('2026-10-16'),
      timeFrom: t('12:00'),
      timeTo: t('10:00'),
    };
    expect(check(content)).toEqual({ problems: [], warnings: [] });
  });

  it('treats a time to after the time from, or a later day, as fine', () => {
    expect(check({ ...ready, timeFrom: t('10:00'), timeTo: t('10:01') }).problems).toEqual([]);
    expect(
      check({ ...ready, endDate: d('2026-10-15'), timeFrom: t('10:00'), timeTo: t('10:00') })
        .problems,
    ).toEqual([]);
    expect(check({ ...ready, timeFrom: null, timeTo: null }).problems).toEqual([]);
  });

  describe('an akce that has not ended yet', () => {
    it('refuses a report on an akce that starts after today', () => {
      expect(check({ ...ready, eventDate: d('2026-11-14') }).problems).toEqual([
        { code: 'event-not-over', path: 'content.eventDate', params: {} },
      ]);
    });

    it('refuses a report on an akce whose last day is after today', () => {
      expect(
        check({ ...ready, eventDate: d('2026-11-12'), endDate: d('2026-11-14') }).problems,
      ).toEqual([{ code: 'event-not-over', path: 'content.endDate', params: {} }]);
    });

    it('takes a report on the day the akce ends', () => {
      expect(check({ ...ready, eventDate: TODAY }).problems).toEqual([]);
      expect(check({ ...ready, eventDate: d('2026-11-11'), endDate: TODAY }).problems).toEqual([]);
    });

    it('never asks a finance or pokyn point about its date', () => {
      const doc = { ...ready, body: richDocFromText('Text.'), eventDate: d('2027-01-01') };
      expect(missingForSubmit('finance', doc, [], TODAY).problems).toEqual([]);
    });
  });

  it('lists every stale name once, in bullet order, on the first one', () => {
    const old = { affiliationYear: '2025/2026' };
    const content = withBullets(
      peopleBullet('organisers', [person('Eva', 'Malá', 'slecna', old)]),
      peopleBullet('participants', [
        jan,
        person('Ivo', 'Starý', 'pan', old),
        person('Eva', 'Malá', 'slecna', old),
        person('Bez', 'Třídy', 'pan', { affiliation: ' ', affiliationYear: undefined }),
      ]),
    );
    expect(check(content).problems).toEqual([
      {
        code: 'class-stale',
        path: 'content.bullets.0.people.0.affiliation',
        params: { names: ['Eva Malá', 'Ivo Starý'] },
      },
    ]);
  });

  it('formats the name with its titles', () => {
    const doc = person('Jana', 'Nová', null, { titlesBefore: 'Mgr.', titlesAfter: ' Ph.D. ' });
    expect(check(withBullets(peopleBullet('participants', [doc]))).problems).toMatchObject([
      { code: 'salutation-required', params: { name: 'Mgr. Jana Nová, Ph.D.' } },
    ]);
  });

  it('keeps the form order: title, dates, times, bullets, opening, statements', () => {
    const content: PointContent = {
      ...ready,
      title: '',
      eventDate: null,
      timeFrom: null,
      opening: '',
      bullets: [peopleBullet('organisers', [person('A', 'B', null)])],
      statements: [],
    };
    expect(check(content).problems.map((p) => p.code)).toEqual([
      'title-required',
      'event-date-required',
      'time-to-without-from',
      'salutation-required',
      'people-required',
      'opening-required',
      'statements-required',
    ]);
  });

  describe('bullet label', () => {
    const labelled = (b: DraftBullet, label: string): DraftBullet => ({ ...b, label });

    it.each([
      ['a filled custom text bullet', textBullet('custom', 'Poznámka'), 1],
      ['a filled custom people bullet', peopleBullet('guests', [jan]), 1],
      ['a filled optional spec bullet the author relabelled', textBullet('results', 'Ano'), 1],
    ])('asks for the label of %s when it is blank', (_name, bullet, index) => {
      for (const label of ['', ' \u00a0 ']) {
        const content = withBullets(peopleBullet('participants', [jan]), labelled(bullet, label));
        expect(check(content).problems).toEqual([
          {
            code: 'label-required',
            path: `content.bullets.${index}.label`,
            params: { n: index + 1 },
          },
        ]);
      }
    });

    it('asks for the label of a required bullet, before its fill problem', () => {
      const content = withBullets(labelled(peopleBullet('participants', []), ' '));
      expect(check(content).problems.map((p) => [p.code, p.path])).toEqual([
        ['label-required', 'content.bullets.0.label'],
        ['people-required', 'content.bullets.0.people'],
      ]);
    });

    it('lists blank labels in bullet order', () => {
      const content = withBullets(
        labelled(textBullet('a', 'x'), ''),
        peopleBullet('participants', [jan]),
        labelled(textBullet('b', 'y'), ''),
      );
      expect(check(content).problems.map((p) => p.path)).toEqual([
        'content.bullets.0.label',
        'content.bullets.2.label',
      ]);
    });

    it('says nothing about the label of an empty optional bullet, which a submit drops', () => {
      const content = withBullets(
        peopleBullet('participants', [jan]),
        labelled(textBullet('custom', ''), ''),
        labelled(peopleBullet('guests', []), ' '),
      );
      expect(check(content)).toEqual({ problems: [], warnings: [] });
      expect(check(submittedContent(content, SPEC))).toEqual({ problems: [], warnings: [] });
    });
  });

  it('reports every problem of every item, not only the first', () => {
    const content: PointContent = {
      ...ready,
      statements: [statement({ speaker: null, speakerGenitive: '', quote: '' })],
    };
    expect(check(content).problems.map((p) => p.code)).toEqual([
      'speaker-required',
      'genitive-required',
      'quote-required',
    ]);
  });

  describe('speaker warning', () => {
    const warning = (n: number, name: string) => ({
      code: 'speaker-not-participant',
      path: `content.statements.${n - 1}.speaker`,
      params: { n, name },
    });

    it('warns, without blocking, when the speaker is in no people bullet', () => {
      const stranger = person('Karel', 'Cizí');
      const result = check({ ...ready, statements: [statement({ speaker: stranger })] });
      expect(result.problems).toEqual([]);
      expect(result.warnings).toEqual([warning(1, 'Karel Cizí')]);
    });

    it('matches by graphId when both have one, whatever the name says', () => {
      const listed = person('Jan', 'Novák', 'pan', { graphId: 'g-1' });
      const renamed = person('Honza', 'Novák', 'pan', { graphId: 'g-1' });
      const other = person('Jan', 'Novák', 'pan', { graphId: 'g-2' });
      const bullets = [peopleBullet('participants', [listed])];
      expect(
        check({ ...ready, bullets, statements: [statement({ speaker: renamed })] }).warnings,
      ).toEqual([]);
      expect(
        check({ ...ready, bullets, statements: [statement({ speaker: other })] }).warnings,
      ).toEqual([warning(1, 'Jan Novák')]);
    });

    it('matches by name when either side has no graphId, ignoring case and titles', () => {
      const listed = person('Jan', 'Novák', 'pan', { graphId: 'g-1' });
      const typed = person('JAN ', ' novák', 'pan', { titlesBefore: 'Ing.' });
      const bullets = [peopleBullet('participants', [listed])];
      expect(
        check({ ...ready, bullets, statements: [statement({ speaker: typed })] }).warnings,
      ).toEqual([]);
      const bullets2 = [peopleBullet('participants', [typed])];
      expect(
        check({ ...ready, bullets: bullets2, statements: [statement({ speaker: listed })] })
          .warnings,
      ).toEqual([]);
    });

    it('keeps the given and family names apart when it matches by name', () => {
      const listed = person('Jan', 'Novák Svoboda');
      const speaker = person('Jan Novák', 'Svoboda');
      const bullets = [peopleBullet('participants', [listed])];
      expect(check({ ...ready, bullets, statements: [statement({ speaker })] }).warnings).toEqual([
        warning(1, 'Jan Novák Svoboda'),
      ]);
    });

    it('does not warn for a statement with no speaker, which is a problem already', () => {
      const result = check({ ...ready, statements: [statement({ speaker: null })] });
      expect(result.warnings).toEqual([]);
      expect(result.problems.map((p) => p.code)).toEqual(['speaker-required']);
    });

    it('does not warn for a speaker with no name at all', () => {
      const nameless = person('', '', 'pan', { affiliation: undefined });
      const result = check({ ...ready, statements: [statement({ speaker: nameless })] });
      expect(result.warnings).toEqual([]);
    });

    it('numbers each warning by its statement', () => {
      const stranger = person('Karel', 'Cizí');
      const result = check({
        ...ready,
        statements: [statement(), statement({ speaker: stranger })],
      });
      expect(result.warnings).toEqual([warning(2, 'Karel Cizí')]);
    });
  });
});

describe('missingForSubmit: finance and pokyn', () => {
  const body = richDocFromText('Navrhujeme zakoupit pomůcky.');
  const doc: PointContent = {
    ...ready,
    title: 'Pomůcky',
    body,
    opening: '',
    eventDate: null,
    bullets: [],
    statements: [],
  };

  it.each(['finance', 'pokyn'] as const)('%s passes with a title and text', (kind) => {
    expect(missingForSubmit(kind, doc, [], TODAY)).toEqual({ problems: [], warnings: [] });
  });

  it.each(['finance', 'pokyn'] as const)('%s needs a title and text, in that order', (kind) => {
    const result = missingForSubmit(
      kind,
      { ...doc, title: ' ', body: richDocFromText(' ') },
      [],
      TODAY,
    );
    expect(result.problems).toEqual([
      { code: 'title-required', path: 'content.title', params: {} },
      { code: 'body-required', path: 'content.body', params: {} },
    ]);
    expect(
      missingForSubmit(kind, { ...doc, body: emptyRichDoc() }, [], TODAY).problems.map(
        (p) => p.code,
      ),
    ).toEqual(['body-required']);
  });

  it.each(['finance', 'pokyn'] as const)(
    '%s does not ask for a date, an opening or people',
    (kind) => {
      expect(
        missingForSubmit(kind, { ...doc, timeFrom: null, timeTo: t('09:00') }, [], TODAY).problems,
      ).toEqual([]);
    },
  );
});

describe('submittedContent', () => {
  it('drops optional bullets left empty and keeps the rest in order', () => {
    const content = withBullets(
      peopleBullet('organisers', []),
      peopleBullet('participants', [jan]),
      textBullet('results', '  \n'),
    );
    expect(submittedContent(content, SPEC).bullets.map((b) => b.key)).toEqual(['participants']);
  });

  it('keeps a filled optional bullet and a filled custom bullet', () => {
    const content = withBullets(
      peopleBullet('organisers', [eva]),
      peopleBullet('participants', [jan]),
      textBullet('results', 'Vyhráli všichni.'),
      textBullet('custom', 'Poznámka'),
    );
    expect(submittedContent(content, SPEC)).toEqual(content);
  });

  it('drops an empty custom bullet, whose key is in no spec', () => {
    const content = withBullets(
      peopleBullet('participants', [jan]),
      textBullet('custom', ' '),
      peopleBullet('guests', []),
    );
    expect(submittedContent(content, SPEC).bullets.map((b) => b.key)).toEqual(['participants']);
  });

  it('never drops a required bullet', () => {
    const content = withBullets(peopleBullet('participants', []));
    expect(submittedContent(content, SPEC).bullets).toEqual(content.bullets);
  });

  it('leaves every other field alone and does not change its argument', () => {
    const content = withBullets(peopleBullet('participants', [jan]), textBullet('results', ''));
    const before = structuredClone(content);
    const result = submittedContent(content, SPEC);
    expect({ ...result, bullets: [] }).toEqual({ ...content, bullets: [] });
    expect(content).toEqual(before);
  });

  it('turns a ready report with empty optional bullets into one that still passes readiness', () => {
    const content = withBullets(
      peopleBullet('organisers', []),
      peopleBullet('participants', [jan]),
      textBullet('results', ''),
    );
    expect(check(content)).toEqual({ problems: [], warnings: [] });
    expect(check(submittedContent(content, SPEC))).toEqual({ problems: [], warnings: [] });
  });
});

describe('missingForSubmit: the body with the opening', () => {
  const bytes = (doc: RichDoc) => new TextEncoder().encode(JSON.stringify(doc)).length;
  const TOO_LONG = { code: 'body-too-long', path: 'content.body', params: {} };

  const paragraph = (text: string): RichDoc['content'][number] => ({
    type: 'paragraph',
    attrs: { indent: 0 },
    content: [{ type: 'text', text }],
  });
  /** A one-paragraph body that, after the opening, makes the whole weigh `size` bytes. */
  function bodyWeighing(opening: string, size: number): RichDoc {
    const whole = (text: string): RichDoc => ({
      type: 'doc',
      content: [...richDocFromText(opening).content, paragraph(text)],
    });
    const fill = size - (bytes(whole('x')) - 1);
    return { type: 'doc', content: [paragraph('a'.repeat(fill))] };
  }

  it('passes the opening and a body of exactly the most bytes', () => {
    const body = bodyWeighing(ready.opening, LIMITS.maxBytes);
    expect(check({ ...ready, body }).problems).toEqual([]);
  });

  it('refuses one byte more, which the body alone does not reach', () => {
    const body = bodyWeighing(ready.opening, LIMITS.maxBytes + 1);
    expect(bytes(body)).toBeLessThan(LIMITS.maxBytes);
    expect(check({ ...ready, body }).problems).toEqual([TOO_LONG]);
  });

  const manyTexts = (n: number): RichDoc => ({
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        attrs: { indent: 0 },
        content: Array.from({ length: n }, () => ({ type: 'text' as const, text: 'a' })),
      },
    ],
  });

  it('passes the opening and a body of exactly the most nodes', () => {
    // The opening is a paragraph and its text: two nodes; the body paragraph is one more.
    expect(check({ ...ready, body: manyTexts(LIMITS.maxNodes - 3) }).problems).toEqual([]);
  });

  it('refuses one node more, which the body alone does not reach', () => {
    const body = manyTexts(LIMITS.maxNodes - 2);
    expect(check({ ...ready, body }).problems).toEqual([TOO_LONG]);
  });

  it('counts the opening’s lines, one paragraph each', () => {
    const body = manyTexts(LIMITS.maxNodes - 4);
    expect(check({ ...ready, opening: 'Jedna.\nDva.', body }).problems).toEqual([TOO_LONG]);
  });

  it('does not count a blank opening, which is reported on its own', () => {
    const body = manyTexts(LIMITS.maxNodes - 1);
    expect(check({ ...ready, opening: ' ', body }).problems).toEqual([
      { code: 'opening-required', path: 'content.opening', params: {} },
    ]);
  });
});
