import { describe, expect, it } from 'vitest';

import type { ReportAddress } from '@/domain/cs';
import type { DraftBullet, DraftPerson, DraftStatement, PointContent } from '@/domain/report';
import { richDocFromText, type RichDoc } from '@/domain/richtext';
import { calDate } from '@/domain/time';

import { snapshotFixture } from '../../../test/support/snapshots';
import type { Block } from '../model';
import { composeItemPreview, composePointPreview, reportFromContent } from './index';

const person = (over: Partial<DraftPerson> = {}): DraftPerson => ({
  salutation: 'pan',
  givenName: 'Jan',
  familyName: 'Novák',
  ...over,
});
const peopleBullet = (
  people: readonly DraftPerson[],
  over: Partial<Extract<DraftBullet, { kind: 'people' }>> = {},
): DraftBullet => ({
  key: 'participants',
  label: 'účast studentů',
  kind: 'people',
  order: 'input',
  people,
  ...over,
});
const textBullet = (text: string, label = 'výsledky'): DraftBullet => ({
  key: 'results',
  label,
  kind: 'text',
  text,
});
const statement = (over: Partial<DraftStatement> = {}): DraftStatement => ({
  speaker: person(),
  speakerGenitive: 'pana Nováka',
  quote: 'Bylo to skvělé.',
  ...over,
});

const content = (over: Partial<PointContent> = {}): PointContent => ({
  title: 'Seminář Matika Česku',
  eventDate: calDate(2026, 10, 7),
  endDate: null,
  timeFrom: null,
  timeTo: null,
  campus: null,
  place: null,
  opening: '',
  openingEdited: false,
  body: richDocFromText('Proběhl seminář.'),
  bullets: [],
  statements: [],
  ...over,
});

const NONE = { people: 0, peopleBullets: 0, textBullets: 0, statements: 0 };
const META = { id: 'p-1' };

/** The whole snapshot parse is the schema check: the report schema itself is private. */
function parses(report: unknown): void {
  snapshotFixture('template-replica', (raw) => {
    raw['reports'] = [report];
  });
}
const reportOf = (c: PointContent) => {
  const { report, omitted } = reportFromContent(c, META);
  if (!report) throw new Error('expected a report');
  return { report, omitted };
};
const paragraphText = (p: RichDoc['content'][number]): string =>
  (p.content ?? []).map((r) => r.text).join('');

const textOf = (b: Block): string => {
  if (b.kind === 'reportLine') return `${b.label}${b.runs.map((r) => r.text).join('')}`;
  if (b.kind === 'body') return b.runs.map((r) => r.text).join('');
  if (b.kind === 'point') return b.text;
  return '';
};

describe('reportFromContent', () => {
  it('has a schema check that can fail', () => {
    expect(() => parses({ id: 'p-1' })).toThrow(/invalid/);
  });

  it.each(['organisers', 'speakers'])(
    'prints no %s line: the opening sentence names them',
    (key) => {
      const { report, omitted } = reportOf(
        content({
          bullets: [
            peopleBullet([person()], { key, label: 'Organizátoři' }),
            peopleBullet([person({ familyName: 'Svoboda' })], { label: 'Účastníci' }),
          ],
        }),
      );
      expect(omitted).toEqual(NONE);
      expect(report?.bullets.map((b) => b.label)).toEqual(['Účastníci']);
    },
  );

  it('maps a complete point and counts nothing', () => {
    const { report, omitted } = reportOf(
      content({
        endDate: calDate(2026, 10, 8),
        timeFrom: { hour: 9, minute: 0 },
        timeTo: { hour: 11, minute: 30 },
        bullets: [
          peopleBullet([
            person({ affiliation: '2.A', graphId: 'g', affiliationYear: '2026/2027' }),
          ]),
          textBullet('Dobré.'),
        ],
        statements: [statement({ affiliation: '2.A' })],
      }),
    );
    expect(omitted).toEqual(NONE);
    expect(report).toMatchObject({
      id: 'p-1',
      title: 'Seminář Matika Česku',
      date: '2026-10-07',
      endDate: '2026-10-08',
      timeFrom: '09:00',
      timeTo: '11:30',
    });
    expect(report.bullets[0]).toEqual({
      kind: 'people',
      label: 'účast studentů',
      order: 'input',
      people: [{ salutation: 'pan', givenName: 'Jan', familyName: 'Novák', affiliation: '2.A' }],
    });
    expect(report.statements).toEqual([
      { speakerGenitive: 'pana Nováka', affiliation: '2.A', quote: 'Bylo to skvělé.' },
    ]);
    parses(report);
  });

  describe('the opening sentence', () => {
    it('goes on with the body’s first paragraph', () => {
      const { report } = reportOf(content({ opening: 'Ve středu proběhl seminář.' }));
      expect(report.body.content.map(paragraphText)).toEqual([
        'Ve středu proběhl seminář. Proběhl seminář.',
      ]);
      parses(report);
    });

    it.each(['', '   ', '\t'])('is left out when blank (%j)', (opening) => {
      const { report } = reportOf(content({ opening }));
      expect(report.body.content.map((p) => p.content?.[0]?.text)).toEqual(['Proběhl seminář.']);
    });
  });

  describe('people', () => {
    it('leaves out a person without a salutation and counts them', () => {
      const { report, omitted } = reportOf(
        content({
          bullets: [peopleBullet([person(), person({ salutation: null, familyName: 'Bez' })])],
        }),
      );
      expect(omitted).toEqual({ ...NONE, people: 1 });
      const bullet = report.bullets[0];
      expect(bullet?.kind === 'people' && bullet.people.map((p) => p.familyName)).toEqual([
        'Novák',
      ]);
      parses(report);
    });

    it('leaves out a person without a family name, which the snapshot requires', () => {
      const { report, omitted } = reportOf(
        content({ bullets: [peopleBullet([person(), person({ familyName: '  ' })])] }),
      );
      expect(omitted).toEqual({ ...NONE, people: 1 });
      parses(report);
    });

    it('drops a people bullet emptied by that, and counts both', () => {
      const { report, omitted } = reportOf(
        content({
          bullets: [peopleBullet([person({ salutation: null })]), textBullet('Dobré.')],
        }),
      );
      expect(omitted).toEqual({ ...NONE, people: 1, peopleBullets: 1 });
      expect(report.bullets.map((b) => b.kind)).toEqual(['text']);
      parses(report);
    });

    it('drops a people bullet that never had anyone', () => {
      const { report, omitted } = reportOf(content({ bullets: [peopleBullet([])] }));
      expect(omitted).toEqual({ ...NONE, peopleBullets: 1 });
      expect(report.bullets).toEqual([]);
    });

    it('drops a bullet without a label, which the snapshot requires', () => {
      const { report, omitted } = reportOf(
        content({
          bullets: [peopleBullet([person()], { label: ' ' }), textBullet('Dobré.', '')],
        }),
      );
      expect(omitted).toEqual({ ...NONE, peopleBullets: 1, textBullets: 1 });
      expect(report.bullets).toEqual([]);
    });

    it('keeps the order the bullet asks for', () => {
      const { report } = reportOf(
        content({ bullets: [peopleBullet([person()], { order: 'class-surname' })] }),
      );
      expect(report.bullets[0]).toMatchObject({ order: 'class-surname' });
    });
  });

  describe('the address of the participants row (ADR 0071)', () => {
    const eva = person({
      salutation: null,
      givenName: 'Eva',
      familyName: 'Malá',
      affiliation: '3.B',
    });
    const jan = person({ salutation: null, familyName: 'Novák', affiliation: '2.A' });
    const row = (
      people: readonly DraftPerson[],
      address: ReportAddress | null | undefined,
      over: Partial<Extract<DraftBullet, { kind: 'people' }>> = {},
    ) =>
      content({
        bullets: [
          peopleBullet(people, {
            label: 'Účastníci',
            order: 'class-surname',
            ...(address !== undefined && { address }),
            ...over,
          }),
        ],
      });
    const printed = (c: PointContent) =>
      composePointPreview(c, { schoolYear: '2026/2027', kind: 'report' })
        .blocks.map(textOf)
        .find((t) => t.startsWith('Účastníci'));

    it('keeps people with no salutation, carries the address and parses', () => {
      const { report, omitted } = reportOf(row([eva, jan], 'slecny-a-panove'));
      expect(omitted).toEqual(NONE);
      expect(report.bullets[0]).toMatchObject({ kind: 'people', address: 'slecny-a-panove' });
      parses(report);
    });

    it('prints the label once, then the people by class and surname, with no salutation', () => {
      expect(printed(row([eva, jan], 'slecny-a-panove'))).toBe(
        'Účastníci: slečny a\u00a0pánové Jan Novák (2.A), Eva Malá (3.B)',
      );
    });

    it.each([
      ['slecny', 'Účastníci: slečny Jan Novák (2.A), Eva Malá (3.B)'],
      ['panove', 'Účastníci: pánové Jan Novák (2.A), Eva Malá (3.B)'],
    ] as const)('prints %s for several people', (address, line) => {
      expect(printed(row([eva, jan], address))).toBe(line);
    });

    it.each([
      ['slecny', eva, 'Účastníci: slečna Eva Malá (3.B)'],
      ['panove', jan, 'Účastníci: pan Jan Novák (2.A)'],
    ] as const)('prints %s for one person', (address, who, line) => {
      expect(printed(row([who], address))).toBe(line);
    });

    it('drops a salutation the author picked before choosing the address', () => {
      const picked = person({ salutation: 'slecna', givenName: 'Eva', familyName: 'Malá' });
      const { report } = reportOf(row([picked, jan], 'panove'));
      const bullet = report.bullets[0];
      expect(bullet?.kind === 'people' && bullet.people.map((p) => p.salutation)).toEqual([
        undefined,
        undefined,
      ]);
      parses(report);
    });

    it('still leaves out a person with no family name, and counts them', () => {
      const { report, omitted } = reportOf(row([eva, person({ familyName: ' ' })], 'panove'));
      expect(omitted).toEqual({ ...NONE, people: 1 });
      parses(report);
    });

    it.each([null, undefined])('treats a row with address %j as before', (address) => {
      const { report, omitted } = reportOf(row([person(), eva], address));
      expect(omitted).toEqual({ ...NONE, people: 1 });
      expect(report.bullets[0]).not.toHaveProperty('address');
      expect(printed(row([person(), eva], address))).toBe('Účastníci: pan Jan Novák');
    });

    it('is the participants row only', () => {
      const { omitted } = reportOf(row([eva], 'panove', { key: 'audience' }));
      expect(omitted).toEqual({ ...NONE, people: 1, peopleBullets: 1 });
    });
  });

  describe('the function of a person (ADR 0072)', () => {
    const deputy = person({
      salutation: 'pani',
      givenName: 'Jana',
      familyName: 'Nováková',
      head: 'zastupce',
      complement: ' pro pedagogickou činnost ',
    });
    const member = person({
      salutation: 'slecna',
      givenName: 'Eva',
      familyName: 'Malá',
      affiliation: '3.B',
      head: 'clen',
      complement: 'PR oddělení',
    });
    const rowOf = (
      people: readonly DraftPerson[],
      over: Partial<Extract<DraftBullet, { kind: 'people' }>> = {},
    ) =>
      content({
        bullets: [peopleBullet(people, { label: 'Účastníci', order: 'input', ...over })],
      });
    const printed = (c: PointContent) =>
      composePointPreview(c, { schoolYear: '2026/2027', kind: 'report' })
        .blocks.map(textOf)
        .find((t) => t.startsWith('Účastníci'));

    it('carries the head and the trimmed complement into the snapshot, and parses', () => {
      const { report, omitted } = reportOf(rowOf([deputy, member]));
      expect(omitted).toEqual(NONE);
      const bullet = report.bullets[0];
      expect(bullet?.kind === 'people' && bullet.people).toEqual([
        {
          salutation: 'pani',
          givenName: 'Jana',
          familyName: 'Nováková',
          head: 'zastupce',
          complement: 'pro pedagogickou činnost',
        },
        {
          salutation: 'slecna',
          givenName: 'Eva',
          familyName: 'Malá',
          affiliation: '3.B',
          head: 'clen',
          complement: 'PR oddělení',
        },
      ]);
      parses(report);
    });

    it('prints it before the name in the row, naming everyone one by one', () => {
      expect(printed(rowOf([deputy, member, person()]))).toBe(
        'Účastníci: zástupkyně pro pedagogickou činnost paní Jana Nováková, členka PR oddělení slečna Eva Malá (3.B), pan Jan Novák',
      );
    });

    it('leaves a row without a head as it was', () => {
      const jana = person({ salutation: 'pani', givenName: 'Jana', familyName: 'Bílá' });
      expect(printed(rowOf([person(), jana]))).toBe('Účastníci: paní Jana Bílá, pan Jan Novák');
    });

    it('leaves out a complement that is blank, and one with no head', () => {
      const { report } = reportOf(
        rowOf([
          person({ head: 'profesor', complement: '  ' }),
          person({ complement: 'x', familyName: 'Svoboda' }),
        ]),
      );
      const bullet = report.bullets[0];
      expect(bullet?.kind === 'people' && bullet.people).toEqual([
        { salutation: 'pan', givenName: 'Jan', familyName: 'Novák', head: 'profesor' },
        { salutation: 'pan', givenName: 'Jan', familyName: 'Svoboda' },
      ]);
      parses(report);
    });

    it('drops the head in a row addressed as a group', () => {
      const { report } = reportOf(
        rowOf([{ ...member, salutation: null }], {
          key: 'participants',
          address: 'slecny',
        }),
      );
      const bullet = report.bullets[0];
      expect(bullet?.kind === 'people' && bullet.people).toEqual([
        { givenName: 'Eva', familyName: 'Malá', affiliation: '3.B' },
      ]);
      parses(report);
      expect(printed(rowOf([{ ...member, salutation: null }], { address: 'slecny' }))).toBe(
        'Účastníci: slečna Eva Malá (3.B)',
      );
    });

    it('names a speaker’s function through the genitive the author left', () => {
      const { report } = reportOf(
        content({
          statements: [
            statement({
              speaker: person({ head: 'profesor' }),
              speakerGenitive: 'pana profesora Nováka',
            }),
          ],
        }),
      );
      expect(report.statements[0]?.speakerGenitive).toBe('pana profesora Nováka');
      parses(report);
    });
  });

  describe('text bullets', () => {
    it.each(['', '   ', '\n'])('drops one that is blank (%j)', (text) => {
      const { report, omitted } = reportOf(content({ bullets: [textBullet(text)] }));
      expect(omitted).toEqual({ ...NONE, textBullets: 1 });
      expect(report.bullets).toEqual([]);
    });

    it('keeps the trimmed text', () => {
      const { report } = reportOf(content({ bullets: [textBullet('  Dobré.  ')] }));
      expect(report.bullets).toEqual([{ kind: 'text', label: 'výsledky', text: 'Dobré.' }]);
    });
  });

  describe('statements', () => {
    it('drops one without a speaker genitive', () => {
      const { report, omitted } = reportOf(
        content({ statements: [statement({ speakerGenitive: '  ' }), statement()] }),
      );
      expect(omitted).toEqual({ ...NONE, statements: 1 });
      expect(report.statements).toHaveLength(1);
      parses(report);
    });

    it('drops one without a quote', () => {
      const { report, omitted } = reportOf(
        content({ statements: [statement({ quote: ' \n ' }), statement()] }),
      );
      expect(omitted).toEqual({ ...NONE, statements: 1 });
      expect(report.statements).toHaveLength(1);
      parses(report);
    });

    it('keeps one whose speaker is not chosen yet, when both texts are there', () => {
      const { report, omitted } = reportOf(content({ statements: [statement({ speaker: null })] }));
      expect(omitted).toEqual(NONE);
      expect(report.statements).toHaveLength(1);
    });
  });

  describe('no report', () => {
    it.each([
      ['an empty title', { title: '' }],
      ['a blank title', { title: '   ' }],
      ['no event date', { eventDate: null }],
    ])('is null with %s, and the counts are still given', (_name, over) => {
      const { report, omitted } = reportFromContent(
        content({
          ...over,
          bullets: [peopleBullet([person({ salutation: null })]), textBullet('')],
          statements: [statement({ quote: '' })],
        }),
        META,
      );
      expect(report).toBeNull();
      expect(omitted).toEqual({ people: 1, peopleBullets: 1, textBullets: 1, statements: 1 });
    });
  });

  describe('plain fields on one line', () => {
    it('collapses a multi-line text bullet to one line', () => {
      const { report } = reportOf(
        content({ bullets: [textBullet('První řádek.\n\nDruhý řádek.\r\n')] }),
      );
      expect(report.bullets).toEqual([
        { kind: 'text', label: 'výsledky', text: 'První řádek. Druhý řádek.' },
      ]);
      parses(report);
    });

    it('collapses a multi-line quote to one line', () => {
      const { report } = reportOf(
        content({ statements: [statement({ quote: 'Bylo\n  to\nskvělé.' })] }),
      );
      expect(report.statements).toEqual([
        { speakerGenitive: 'pana Nováka', quote: 'Bylo to skvělé.' },
      ]);
      parses(report);
    });

    it('collapses a tab in the title', () => {
      const { report } = reportOf(content({ title: 'Seminář\tMatika\n Česku ' }));
      expect(report.title).toBe('Seminář Matika Česku');
      parses(report);
    });

    it('collapses a tab in a bullet label', () => {
      const { report } = reportOf(content({ bullets: [textBullet('Dobré.', 'vý\tsledky')] }));
      expect(report.bullets[0]).toMatchObject({ label: 'vý sledky' });
      parses(report);
    });

    it('collapses a tab in a name and in an affiliation', () => {
      const { report } = reportOf(
        content({
          bullets: [
            peopleBullet([
              person({
                givenName: 'Jan\tKarel',
                familyName: 'Novák\tz Lhoty',
                affiliation: '3.\tB',
              }),
            ]),
          ],
        }),
      );
      expect(report.bullets[0]).toMatchObject({
        people: [
          {
            salutation: 'pan',
            givenName: 'Jan Karel',
            familyName: 'Novák z Lhoty',
            affiliation: '3. B',
          },
        ],
      });
      parses(report);
    });

    it('collapses a tab in a statement’s genitive and affiliation', () => {
      const { report } = reportOf(
        content({
          statements: [statement({ speakerGenitive: 'pana\tNováka', affiliation: '3.\nB' })],
        }),
      );
      expect(report.statements).toEqual([
        { speakerGenitive: 'pana Nováka', affiliation: '3. B', quote: 'Bylo to skvělé.' },
      ]);
      parses(report);
    });

    it('counts a field that is nothing but whitespace as blank', () => {
      const { report, omitted } = reportOf(
        content({
          bullets: [textBullet('\n\t ', 'výsledky'), textBullet('Dobré.', '\t')],
          statements: [statement({ quote: ' \n ' })],
        }),
      );
      expect(omitted).toEqual({ people: 0, peopleBullets: 0, textBullets: 2, statements: 1 });
      parses(report);
    });

    it('keeps the opening and a body text with a tab, which rich text allows', () => {
      const { report } = reportOf(
        content({
          opening: 'Ve\tstředu\nproběhl seminář.',
          body: {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                attrs: { indent: 0 },
                content: [{ type: 'text', text: 'Jedna\tdva.' }],
              },
            ],
          },
        }),
      );
      expect(report.body.content.map(paragraphText)).toEqual([
        'Ve\tstředu',
        'proběhl seminář. Jedna\tdva.',
      ]);
      parses(report);
    });

    it('keeps an opening with blank lines and Windows line ends', () => {
      const { report } = reportOf(content({ opening: 'První.\r\n\r\nDruhá.' }));
      parses(report);
    });
  });

  describe('padded fields', () => {
    it('trims names and affiliations exactly', () => {
      const { report } = reportOf(
        content({
          bullets: [
            peopleBullet([
              person({
                givenName: '  Jan ',
                familyName: ' Novák  ',
                affiliation: '  3.B ',
              }),
            ]),
          ],
          statements: [statement({ affiliation: ' 3.B ' })],
        }),
      );
      expect(report.bullets[0]).toMatchObject({
        people: [
          {
            salutation: 'pan',
            givenName: 'Jan',
            familyName: 'Novák',
            affiliation: '3.B',
          },
        ],
      });
      expect(report.statements).toEqual([
        { speakerGenitive: 'pana Nováka', affiliation: '3.B', quote: 'Bylo to skvělé.' },
      ]);
    });

    it('leaves out a whitespace-only affiliation and given name part', () => {
      const { report } = reportOf(
        content({
          bullets: [peopleBullet([person({ affiliation: '   ' })])],
          statements: [statement({ affiliation: ' \n ' })],
        }),
      );
      const [first] = report.bullets;
      expect(first?.kind === 'people' && first.people[0]).toEqual({
        salutation: 'pan',
        givenName: 'Jan',
        familyName: 'Novák',
      });
      expect(report.statements[0]).not.toHaveProperty('affiliation');
      parses(report);
    });
  });

  describe('dates and times the snapshot would refuse', () => {
    it.each([
      ['an end date before the start', { endDate: calDate(2026, 10, 6) }, 'endDate'],
      ['a time to without a time from', { timeTo: { hour: 10, minute: 0 } }, 'timeTo'],
      [
        'a time to that is not after the time from on one day',
        { timeFrom: { hour: 10, minute: 0 }, timeTo: { hour: 10, minute: 0 } },
        'timeTo',
      ],
    ])('leaves out %s instead of failing the parse', (_name, over, key) => {
      const { report } = reportOf(content(over));
      expect(report).not.toHaveProperty(key);
      parses(report);
    });

    it('treats an end date equal to the start as one day: the time to equal to the time from goes', () => {
      const { report } = reportOf(
        content({
          endDate: calDate(2026, 10, 7),
          timeFrom: { hour: 10, minute: 0 },
          timeTo: { hour: 10, minute: 0 },
        }),
      );
      expect(report).toMatchObject({
        date: '2026-10-07',
        endDate: '2026-10-07',
        timeFrom: '10:00',
      });
      expect(report).not.toHaveProperty('timeTo');
      parses(report);
    });

    it('keeps an end date equal to the start, and a later time to', () => {
      const { report } = reportOf(
        content({
          endDate: calDate(2026, 10, 7),
          timeFrom: { hour: 10, minute: 0 },
          timeTo: { hour: 11, minute: 0 },
        }),
      );
      expect(report).toMatchObject({
        date: '2026-10-07',
        endDate: '2026-10-07',
        timeFrom: '10:00',
        timeTo: '11:00',
      });
      parses(report);
    });

    it('keeps a time to earlier than the time from on a multi-day event', () => {
      const { report } = reportOf(
        content({
          endDate: calDate(2026, 10, 8),
          timeFrom: { hour: 22, minute: 0 },
          timeTo: { hour: 6, minute: 0 },
        }),
      );
      expect(report).toMatchObject({ timeFrom: '22:00', timeTo: '06:00' });
      parses(report);
    });
  });

  it('parses with the snapshot schema for every shape above together', () => {
    const { report } = reportOf(
      content({
        opening: 'Ve středu proběhl seminář.',
        bullets: [
          peopleBullet([person(), person({ salutation: 'slecna', givenName: 'Eva' })], {
            order: 'class-surname',
          }),
          textBullet('Dobré.'),
        ],
        statements: [statement(), statement({ speakerGenitive: 'slečny Evy Malé' })],
      }),
    );
    parses(report);
  });
});

describe('composePointPreview', () => {
  const opts = { schoolYear: '2026/2027', kind: 'report' as const };

  it('numbers the one point 1', () => {
    const { blocks } = composePointPreview(content(), opts);
    expect(blocks[0]).toMatchObject({ kind: 'point', number: 1, text: 'Seminář Matika Česku' });
    expect(blocks.filter((b) => b.kind === 'point')).toHaveLength(1);
  });

  it('puts the opening sentence first, then the body, bullets and statements', () => {
    const { blocks } = composePointPreview(
      content({
        opening: 'Ve středu proběhl seminář.',
        bullets: [peopleBullet([person()])],
        statements: [statement()],
      }),
      opts,
    );
    expect(blocks.map(textOf).filter(Boolean)).toEqual([
      'Seminář Matika Česku',
      'Ve středu proběhl seminář. Proběhl seminář.',
      'účast studentů: pan Jan Novák',
      'vyjádření pana Nováka: „Bylo to skvělé.“',
    ]);
  });

  it('fills the school year token', () => {
    const { blocks } = composePointPreview(
      content({ body: richDocFromText('Ve školním roce {skolniRok}.') }),
      { schoolYear: '2027/2028', kind: 'report' },
    );
    expect(blocks.map(textOf).join('\n')).toContain('Ve školním roce 2027/2028.');
  });

  it('orders a bullet by the given group order', () => {
    const people = [person(), person({ salutation: 'pani', givenName: 'Eva', familyName: 'Malá' })];
    const text = (groupOrder: readonly ('pan' | 'pani' | 'slecna')[]) =>
      composePointPreview(content({ bullets: [peopleBullet(people)] }), { ...opts, groupOrder })
        .blocks.map(textOf)
        .find((t) => t.startsWith('účast'));
    expect(text(['pan', 'pani'])).not.toEqual(text(['pani', 'pan']));
  });

  it('gives no blocks without a title or a date, with the counts', () => {
    const result = composePointPreview(
      content({ title: '', bullets: [textBullet('')], statements: [statement({ quote: '' })] }),
      opts,
    );
    expect(result).toEqual({ blocks: [], omitted: { ...NONE, textBullets: 1, statements: 1 } });
    expect(composePointPreview(content({ eventDate: null }), opts).blocks).toEqual([]);
  });

  it('passes the omitted counts through', () => {
    const { omitted } = composePointPreview(
      content({ bullets: [peopleBullet([person({ salutation: null })])] }),
      opts,
    );
    expect(omitted).toEqual({ ...NONE, people: 1, peopleBullets: 1 });
  });
});

describe('composePointPreview for a proposal', () => {
  const opts = { schoolYear: '2026/2027' };
  /** A proposal names no date, bullets or statements: only its title and its text. */
  const proposal = (over: Partial<PointContent> = {}): PointContent =>
    content({
      eventDate: null,
      opening: '',
      body: richDocFromText('Navrhujeme zakoupit nové lavice.'),
      ...over,
    });

  it.each(['finance', 'pokyn'] as const)('numbers a %s as point 1, its text beneath', (kind) => {
    const { blocks, omitted } = composePointPreview(proposal(), { ...opts, kind });
    expect(blocks[0]).toMatchObject({ kind: 'point', number: 1, text: 'Seminář Matika Česku' });
    expect(blocks.map(textOf).filter(Boolean)).toEqual([
      'Seminář Matika Česku',
      'Navrhujeme zakoupit nové lavice.',
    ]);
    expect(omitted).toEqual(NONE);
  });

  it('prints the paragraphs of the text, each as its own block', () => {
    const { blocks } = composePointPreview(
      proposal({ body: richDocFromText('První odstavec.\nDruhý odstavec.') }),
      { ...opts, kind: 'finance' },
    );
    expect(blocks.map(textOf).filter(Boolean)).toEqual([
      'Seminář Matika Česku',
      'První odstavec.',
      'Druhý odstavec.',
    ]);
  });

  it('fills the school year token, like the printed document', () => {
    const { blocks } = composePointPreview(
      proposal({ body: richDocFromText('Ve školním roce {skolniRok}.') }),
      { schoolYear: '2027/2028', kind: 'pokyn' },
    );
    expect(blocks.map(textOf).join('\n')).toContain('Ve školním roce 2027/2028.');
  });

  it('shows a title without a text as a heading alone, and nothing without a title', () => {
    const bare = composePointPreview(proposal({ body: richDocFromText('') }), {
      ...opts,
      kind: 'finance',
    });
    expect(bare.blocks.map(textOf).filter(Boolean)).toEqual(['Seminář Matika Česku']);
    expect(
      composePointPreview(proposal({ title: '  ' }), { ...opts, kind: 'finance' }).blocks,
    ).toEqual([]);
  });

  it('puts the heading on one line, as the document does', () => {
    const { blocks } = composePointPreview(proposal({ title: 'Nové\tlavice\npro třídy' }), {
      ...opts,
      kind: 'finance',
    });
    expect(blocks[0]).toMatchObject({ kind: 'point', text: 'Nové lavice pro třídy' });
  });

  it('ends the point with the one empty line the printed points have', () => {
    const { blocks } = composePointPreview(proposal(), { ...opts, kind: 'finance' });
    expect(blocks.map((b) => b.kind)).toEqual(['point', 'body', 'spacer']);
  });

  it('shows nothing for a report without a start date, whatever else it holds', () => {
    expect(composePointPreview(proposal(), { ...opts, kind: 'report' }).blocks).toEqual([]);
  });
});

describe('composeItemPreview', () => {
  const opts = { schoolYear: '2026/2027' };
  const item = (over: Partial<Parameters<typeof composeItemPreview>[0]> = {}) => ({
    title: 'Poděkování',
    slot: null,
    body: richDocFromText('Děkuji všem.'),
    quotes: [],
    ...over,
  });

  it('prints the title and the text as point 1', () => {
    const blocks = composeItemPreview(item(), opts);
    expect(blocks[0]).toMatchObject({ kind: 'point', number: 1, text: 'Poděkování' });
    expect(blocks.map(textOf).join('\n')).toContain('Děkuji všem.');
  });

  it('fills the school year token', () => {
    const blocks = composeItemPreview(item({ body: richDocFromText('Rok {skolniRok}.') }), opts);
    expect(blocks.map(textOf).join('\n')).toContain('Rok 2026/2027.');
  });

  it('shows nothing without a title', () => {
    expect(composeItemPreview(item({ title: '  \t ' }), opts)).toEqual([]);
  });

  it.each(['meetings', 'events'] as const)(
    'shows nothing for the %s slot, which fills itself',
    (slot) => {
      expect(composeItemPreview(item({ slot }), opts)).toEqual([]);
    },
  );

  it('shows nothing for media until it has text', () => {
    expect(composeItemPreview(item({ slot: 'media', body: richDocFromText('') }), opts)).toEqual(
      [],
    );
    expect(
      composeItemPreview(item({ slot: 'media', body: richDocFromText('Ohlas.') }), opts),
    ).not.toEqual([]);
  });

  it('shows partners only with quotes, one partner line each', () => {
    expect(composeItemPreview(item({ slot: 'partners' }), opts)).toEqual([]);
    const blocks = composeItemPreview(
      item({
        slot: 'partners',
        quotes: [{ speakerGenitive: 'pana Nováka', quote: 'Díky.' }],
      }),
      opts,
    );
    expect(blocks.filter((b) => b.kind === 'partner')).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ kind: 'point', number: 1 });
  });
});
