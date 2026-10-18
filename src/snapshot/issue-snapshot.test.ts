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

  it.each<[string, Path, unknown, unknown]>([
    ['a non-Monday', ['issue', 'monday'], '2026-10-13', 'issue.monday: must be a Monday'],
    [
      'a meeting outside the week',
      ['issue', 'meetingDate'],
      '2026-10-19',
      'issue.meetingDate: must be in the week of the Monday',
    ],
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
      'presentText: contains control characters',
    ],
    [
      'a line break in a title',
      ['reports', 0, 'title'],
      'Seminář\nMatika',
      'reports.0.title: contains control characters',
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

  it('rejects a future schema version', () => {
    expect(errorsOf(variant(['schema'], 2))).toContainEqual(expect.stringMatching(/^schema:/));
  });
});
