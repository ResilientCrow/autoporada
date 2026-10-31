import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { parseIssueSnapshot } from './index';

const replica: unknown = JSON.parse(
  readFileSync(
    new URL('../../test/fixtures/snapshots/template-replica.json', import.meta.url),
    'utf8',
  ),
);

type Path = readonly (string | number)[];

/** A deep copy of the replica with the value at `path` replaced. */
function variant(path: Path, value: unknown): unknown {
  const copy = structuredClone(replica);
  let node = copy as Record<string | number, unknown>;
  for (const key of path.slice(0, -1)) node = node[key] as Record<string | number, unknown>;
  node[path[path.length - 1] ?? ''] = value;
  return copy;
}

const errorsOf = (input: unknown) => {
  const result = parseIssueSnapshot(input);
  return result.ok ? [] : result.errors;
};

describe('IssueSnapshot v1', () => {
  it('accepts the template replica and defaults omitted fields', () => {
    const result = parseIssueSnapshot(replica);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.snapshot.pokyny[0]?.quotes).toEqual([]);
  });

  it.each(['2026-10-19', '2026-10-09'])(
    'accepts a meeting date %s outside the week of the Monday (a moved porada)',
    (meetingDate) => {
      expect(parseIssueSnapshot(variant(['issue', 'meetingDate'], meetingDate)).ok).toBe(true);
    },
  );

  it.each<[string, Path, unknown, unknown]>([
    ['a non-Monday', ['issue', 'monday'], '2026-10-13', 'issue.monday: must be a Monday'],
    [
      'an inverted report range',
      ['reports', 0, 'endDate'],
      '2026-10-01',
      'reports.0.endDate: ends before it starts',
    ],
    [
      'an impossible date',
      ['futureItems', 0, 'date'],
      '2026-02-30',
      'futureItems.0.date: must be a calendar date YYYY-MM-DD',
    ],
    ['an unknown key', ['extra'], 1, '(root): Unrecognized key: "extra"'],
    [
      'a control character',
      ['presentText'],
      'Mgr. Novák\u0007',
      'presentText: contains control or direction characters',
    ],
    [
      'a line break in a title',
      ['reports', 0, 'title'],
      'Seminář\nMatika',
      'reports.0.title: contains control or direction characters',
    ],
    [
      'an empty people bullet',
      ['reports', 0, 'bullets', 0, 'people'],
      [],
      expect.stringMatching(/^reports\.0\.bullets\.0\.people/),
    ],
    [
      'rich text with a link',
      ['annex2'],
      {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'link' }] }] },
        ],
      },
      expect.stringContaining('only bold and italic are allowed'),
    ],
    [
      'an indented report body',
      ['reports', 0, 'body', 'content', 0, 'attrs', 'indent'],
      1,
      expect.stringContaining('must be an integer 0–0'),
    ],
  ])('rejects %s', (_case, path, value, error) => {
    expect(errorsOf(variant(path, value))).toContainEqual(error);
  });

  it.each<[string, Path, unknown, string]>([
    [
      'a bidi override',
      ['reports', 0, 'title'],
      `Seminář ${String.fromCharCode(0x202e)}rtl`,
      'reports.0.title: contains control or direction characters',
    ],
    [
      'a tab in a single-line field',
      ['guestsText'],
      'Ing.\tDvořák',
      'guestsText: contains control or direction characters',
    ],
    [
      'an over-long title',
      ['reports', 0, 'title'],
      'x'.repeat(301),
      'reports.0.title: must be at most 300 characters',
    ],
    ['an empty point title', ['pokyny', 4, 'title'], '  ', 'pokyny.4.title: must not be empty'],
    [
      'a school year that is not two consecutive years',
      ['issue', 'schoolYear'],
      '2026/2028',
      'issue.schoolYear: must be two consecutive years',
    ],
    [
      'an end time without a start',
      ['futureItems', 0, 'timeFrom'],
      undefined,
      'futureItems.0.timeTo: needs a start time',
    ],
    [
      'a time range running backwards',
      ['futureItems', 0, 'timeTo'],
      '9:00',
      'futureItems.0.timeTo: must be after the start time',
    ],
    [
      'a system slot appearing twice',
      ['pokyny', 1, 'slot'],
      'meetings',
      'pokyny.1.slot: slot meetings appears twice',
    ],
    [
      'a missing agenda slot',
      ['pokyny', 1, 'slot'],
      'talent',
      'pokyny: the events slot is missing',
    ],
    [
      'quotes outside the partners slot',
      ['pokyny', 4, 'quotes'],
      [{ speakerGenitive: 'pana X', quote: 'Y' }],
      'pokyny.4.quotes: only the partners slot has quotes',
    ],
    [
      'a body on a generated slot',
      ['pokyny', 0, 'body'],
      { type: 'doc', content: [{ type: 'paragraph' }] },
      'pokyny.0.body: the meetings slot has no body',
    ],
    [
      'a slot in HOSPODAŘENÍ',
      ['hospodareni', 0, 'slot'],
      'media',
      'hospodareni.0.slot: HOSPODAŘENÍ items have no slot',
    ],
    [
      'a second Příloha 1 list',
      ['registry', 1, 'purpose'],
      'annex1',
      'registry.1.purpose: only one Příloha 1 list',
    ],
  ])('rejects %s', (_case, path, value, error) => {
    expect(errorsOf(variant(path, value))).toContainEqual(error);
  });

  it('accepts an end time on a multi-day item, and times on reports', () => {
    // futureItems[5] is the three-day CERN excursion.
    expect(errorsOf(variant(['futureItems', 5, 'timeFrom'], '18:00'))).toEqual([]);
  });

  it('rejects a future schema version', () => {
    expect(errorsOf(variant(['schema'], 2))).toContainEqual(expect.stringMatching(/^schema:/));
  });
});
