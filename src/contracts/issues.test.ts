import { describe, expect, it } from 'vitest';

import { toIsoDate } from '@/domain/time';

import { toIssueRows } from './index';

describe('toIssueRows', () => {
  it('reads the wire rows as calendar days, instants and statuses, in order', () => {
    const known = toIssueRows([
      {
        monday: '2026-10-26',
        meetingDate: '2026-10-26',
        deadlineAt: '2026-10-25T17:00:00.000Z',
        status: 'open',
      },
      {
        monday: '2026-11-02',
        meetingDate: '2026-11-02',
        deadlineAt: '2026-11-01T17:00:00.000Z',
        status: 'generated',
      },
    ]);
    expect(known.map((row) => toIsoDate(row.monday))).toEqual(['2026-10-26', '2026-11-02']);
    expect(known.map((row) => row.deadlineAt.toISOString())).toEqual([
      '2026-10-25T17:00:00.000Z',
      '2026-11-01T17:00:00.000Z',
    ]);
    expect(known.map((row) => row.status)).toEqual(['open', 'generated']);
  });

  it('puts the meeting on the Monday: the wire has no meeting date yet', () => {
    const [row] = toIssueRows([
      {
        monday: '2026-10-26',
        meetingDate: '2026-10-26',
        deadlineAt: '2026-10-25T17:00:00.000Z',
        status: 'open',
      },
    ]);
    expect(row && toIsoDate(row.meetingDate)).toBe('2026-10-26');
  });

  it('takes the rows of issues.window as they come, version and all', () => {
    const wire = [
      {
        monday: '2026-10-26',
        meetingDate: '2026-10-26',
        deadlineAt: '2026-10-25T17:00:00.000Z',
        status: 'generated' as const,
        version: 3,
      },
    ];
    expect(toIssueRows(wire)[0]?.status).toBe('generated');
  });

  it('is empty for no rows', () => {
    expect(toIssueRows([])).toEqual([]);
  });
});
