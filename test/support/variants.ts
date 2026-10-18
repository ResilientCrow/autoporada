/**
 * Snapshot variants for golden and render tests, each a small change to the
 * template replica so the differences are easy to read.
 */
import type { IssueSnapshot } from '@/snapshot';

import { snapshotFixture } from './snapshots';

type Raw = Record<string, unknown>;
const list = (raw: Raw, key: string) => raw[key] as Raw[];

const GIVEN = ['Adam', 'Eva', 'Jan', 'Lucie', 'Petr', 'Tereza', 'Tomáš', 'Jana', 'Ondřej', 'Klára'];
const FAMILY = [
  'Novák',
  'Malá',
  'Dvořák',
  'Králová',
  'Černý',
  'Svobodová',
  'Veselý',
  'Horáková',
  'Kučera',
  'Marková',
];
const CLASSES = ['1.A', '1.B', 'L1B', '2.A', '2.B', '3.A', '3.C', '4.A'];

export const VARIANTS: Readonly<Record<string, () => IssueSnapshot>> = {
  'template-replica': () => snapshotFixture('template-replica'),

  /** Nothing optional: no ohlasy, HOSPODAŘENÍ, reports, future items, students or Příloha 2. */
  lean: () =>
    snapshotFixture('template-replica', (raw) => {
      raw['pokyny'] = list(raw, 'pokyny')
        .filter((i) => i['slot'] !== 'media')
        .map((i) => (i['slot'] === 'partners' ? { ...i, quotes: [] } : i));
      raw['hospodareni'] = [];
      raw['reports'] = [];
      raw['futureItems'] = [];
      list(raw, 'registry').forEach((l) => (l['entries'] = []));
    }),

  /** The smallest valid issue: only the agenda slots, nobody, nothing. */
  empty: () =>
    snapshotFixture('template-replica', (raw) => {
      raw['presentText'] = '';
      raw['guestsText'] = '';
      raw['pokyny'] = list(raw, 'pokyny').filter(
        (i) => i['slot'] === 'meetings' || i['slot'] === 'events',
      );
      raw['hospodareni'] = [];
      raw['reports'] = [];
      raw['futureItems'] = [];
      raw['registry'] = [];
    }),

  /** Dates on every window boundary of the issue of 12 October 2026, and same-day ordering. */
  'full-week': () =>
    snapshotFixture('template-replica', (raw) => {
      const future = (
        id: string,
        kind: string,
        date: string,
        extra: Record<string, unknown> = {},
      ) => ({
        id,
        kind,
        title: `${kind} ${id}`,
        date,
        ...extra,
      });
      raw['futureItems'] = [
        future('j-M', 'jednani', '2026-10-12', { timeFrom: '9:00' }),
        future('j-M+7', 'jednani', '2026-10-19'),
        future('j-M+8', 'jednani', '2026-10-20'),
        future('a-before-M', 'akce', '2026-10-08', { endDate: '2026-10-12' }),
        future('a-day', 'akce', '2026-10-13'),
        future('a-timed', 'akce', '2026-10-13', { timeFrom: '15:00', timeTo: '17:00' }),
        future('a-M+14', 'akce', '2026-10-26'),
        future('a-M+15', 'akce', '2026-10-27'),
        future('a-past', 'akce', '2026-10-09'),
      ];
      const [first] = list(raw, 'reports');
      const report = (id: string, date: string, extra: Record<string, unknown> = {}) => ({
        ...first,
        id,
        title: `Zpráva ${id}`,
        date,
        timeFrom: undefined,
        timeTo: undefined,
        ...extra,
      });
      raw['reports'] = [
        report('r-oct-09-late', '2026-10-09', { timeFrom: '14:00' }),
        report('r-oct-09-day', '2026-10-09'),
        report('r-oct-05-camp', '2026-10-05', { endDate: '2026-10-07' }),
        report('r-ends-on-M', '2026-10-10', { endDate: '2026-10-12' }),
        report('r-oct-09-early', '2026-10-09', { timeFrom: '8:00' }),
      ];
    }),

  /** Agenda windows that cross the new year. */
  'year-boundary': () =>
    snapshotFixture('template-replica', (raw) => {
      raw['issue'] = {
        id: 'issue-2026-12-28',
        monday: '2026-12-28',
        meetingDate: '2026-12-29',
        schoolYear: '2026/2027',
      };
      raw['futureItems'] = [
        {
          id: 'f1',
          kind: 'jednani',
          title: 'porada předmětových komisí',
          date: '2027-01-04',
          timeFrom: '13:00',
        },
        {
          id: 'f2',
          kind: 'akce',
          title: 'lyžařský kurz 1.A',
          date: '2027-01-09',
          endDate: '2027-01-15',
          campus: 'jinde',
          place: 'Špindlerův Mlýn',
        },
        { id: 'f3', kind: 'akce', title: 'pololetní vysvědčení', date: '2027-01-29' },
      ];
      raw['reports'] = [];
    }),

  /** A long Příloha 1 that flows through both columns over several pages. */
  'many-students': () =>
    snapshotFixture('template-replica', (raw) => {
      const annex1 = list(raw, 'registry')[0];
      if (annex1) {
        annex1['entries'] = Array.from({ length: 150 }, (_, i) => ({
          givenName: GIVEN[i % 10],
          familyName: `${FAMILY[(i * 3) % 10]}${i}`,
          classCode: CLASSES[i % 8],
          isNew: i % 7 === 0,
        }));
      }
    }),

  /** Příloha 2 with standing-content levels. */
  annex2: () =>
    snapshotFixture('template-replica', (raw) => {
      raw['annex2'] = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            attrs: { indent: 0 },
            content: [{ type: 'text', text: 'Harmonogram maturitních zkoušek' }],
          },
          {
            type: 'paragraph',
            attrs: { indent: 1 },
            content: [{ type: 'text', text: 'písemné zkoušky' }],
          },
          {
            type: 'paragraph',
            attrs: { indent: 2 },
            content: [{ type: 'text', text: 'didaktické testy 2. 5. 2027' }],
          },
        ],
      };
    }),

  /** Hostile text everywhere a submitter can type. */
  'escape-hell': () =>
    snapshotFixture('template-replica', (raw) => {
      const hostile =
        '<script>alert("x")</script> & ]]> { PAGE } { HYPERLINK "https://evil.example" }';
      raw['presentText'] = hostile;
      raw['guestsText'] = `${hostile} ${'Dlouhéslovobezmezer'.repeat(12)}`;
      const reports = list(raw, 'reports');
      const first = reports[0];
      if (first) {
        first['title'] = hostile;
        first['statements'] = [{ speakerGenitive: 'pana <b>Nikoho</b>', quote: hostile }];
      }
      list(raw, 'futureItems')[0]!['title'] = hostile;
      list(raw, 'pokyny')[4]!['body'] = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            attrs: { indent: 1 },
            content: [{ type: 'text', text: hostile, marks: [{ type: 'bold' }] }],
          },
        ],
      };
    }),
};
