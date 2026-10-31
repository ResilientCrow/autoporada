import { describe, expect, it } from 'vitest';

import { entriesAsOf, isNewInIssue, sortForDocument } from './index';

const at = (iso: string) => new Date(iso);

describe('isNewInIssue', () => {
  it('is bold until published, and stays bold when the same issue is regenerated', () => {
    expect(isNewInIssue({ firstPublishedIssueId: null }, 'issue-19')).toBe(true);
    expect(isNewInIssue({ firstPublishedIssueId: 'issue-19' }, 'issue-19')).toBe(true);
    expect(isNewInIssue({ firstPublishedIssueId: 'issue-12' }, 'issue-19')).toBe(false);
  });
});

describe('entriesAsOf', () => {
  const entries = [
    { id: 'kept', addedAt: at('2026-10-01T10:00Z'), removedAt: null },
    { id: 'added-later', addedAt: at('2026-10-20T10:00Z'), removedAt: null },
    { id: 'removed-later', addedAt: at('2026-10-01T10:00Z'), removedAt: at('2026-10-21T10:00Z') },
    { id: 'removed-before', addedAt: at('2026-10-01T10:00Z'), removedAt: at('2026-10-10T10:00Z') },
  ];

  it('reads the registry as it stood at the first generation', () => {
    expect(entriesAsOf(entries, at('2026-10-18T19:00Z')).map((e) => e.id)).toEqual([
      'kept',
      'removed-later',
    ]);
  });
});

describe('sortForDocument', () => {
  it('orders by class, then surname', () => {
    const students = [
      { givenName: 'Jan', familyName: 'Žák', classCode: '1.A' },
      { givenName: 'Eva', familyName: 'Čermáková', classCode: '2.B' },
      { givenName: 'Petr', familyName: 'Adámek', classCode: '1.A' },
      { givenName: 'Ola', familyName: 'Bílá', classCode: 'L1B' },
    ];
    expect(sortForDocument(students).map((s) => s.familyName)).toEqual([
      'Adámek',
      'Žák',
      'Bílá',
      'Čermáková',
    ]);
  });
});
