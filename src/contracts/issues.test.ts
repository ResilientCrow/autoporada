import { describe, expect, it } from 'vitest';

import { toIsoDate } from '@/domain/time';

import { toKnownIssues } from './index';

describe('toKnownIssues', () => {
  it('reads the wire rows as calendar days, instants and statuses, in order', () => {
    const known = toKnownIssues([
      { monday: '2026-10-26', deadlineAt: '2026-10-25T17:00:00.000Z', status: 'open' },
      { monday: '2026-11-02', deadlineAt: '2026-11-01T17:00:00.000Z', status: 'skipped' },
    ]);
    expect(known.map((row) => toIsoDate(row.monday))).toEqual(['2026-10-26', '2026-11-02']);
    expect(known.map((row) => row.deadlineAt.toISOString())).toEqual([
      '2026-10-25T17:00:00.000Z',
      '2026-11-01T17:00:00.000Z',
    ]);
    expect(known.map((row) => row.status)).toEqual(['open', 'skipped']);
  });

  it('takes the rows of issues.window as they come, version and all', () => {
    const wire = [
      {
        monday: '2026-10-26',
        deadlineAt: '2026-10-25T17:00:00.000Z',
        status: 'generated' as const,
        version: 3,
      },
    ];
    expect(toKnownIssues(wire)[0]?.status).toBe('generated');
  });

  it('is empty for no rows', () => {
    expect(toKnownIssues([])).toEqual([]);
  });
});
