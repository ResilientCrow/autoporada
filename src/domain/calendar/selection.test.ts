import { describe, expect, it } from 'vitest';

import type { IssueStatus } from '@/domain/review';
import { parseIsoDate as d, parseWallTime, toIsoDate } from '@/domain/time';

import {
  deadline,
  deadlineChange,
  dueMonday,
  issueSlots,
  refreezable,
  submitMonday,
  type DeadlineRule,
  type IssueRow,
} from './index';

const due = (earliest: string, handIn: string) =>
  toIsoDate(dueMonday({ earliest: d(earliest), handIn: d(handIn) }));

describe('dueMonday', () => {
  it('is the first Monday when it is the later', () => {
    expect(due('2026-11-09', '2026-10-26')).toBe('2026-11-09');
  });

  it('is the hand-in Monday when it is the later: a resubmit after the first Monday', () => {
    expect(due('2026-10-26', '2026-11-09')).toBe('2026-11-09');
  });

  it('is that Monday when both are the same', () => {
    expect(due('2026-10-26', '2026-10-26')).toBe('2026-10-26');
  });
});

describe('a change of the deadline rule (ADR 0032)', () => {
  // Friday 23 October 2026, 12.00 in Prague: Thursday's deadline of Monday 26 October has passed.
  const NOW = new Date('2026-10-23T10:00:00Z');
  const TODAY = d('2026-10-23');
  const THURSDAY: DeadlineRule = { dayOffset: -4, time: parseWallTime('20:00') };
  const SUNDAY: DeadlineRule = { dayOffset: -1, time: parseWallTime('20:00') };
  const row = (monday: string, status: IssueStatus = 'open', at?: Date, meeting = monday) => ({
    monday: d(monday),
    meetingDate: d(meeting),
    deadlineAt: at ?? deadline(d(meeting), THURSDAY),
    status,
  });
  const change = (rows: readonly IssueRow[] = [], rule = SUNDAY) => {
    const found = deadlineChange(NOW, THURSDAY, rule, issueSlots(rows, TODAY, THURSDAY));
    return found && { ...found, keep: toIsoDate(found.keep), from: toIsoDate(found.from) };
  };

  it('keeps the Monday a hand-in goes to now and applies the rule from the next one', () => {
    expect(change()).toMatchObject({ keep: '2026-11-02', from: '2026-11-09' });
  });

  it('freezes every unstored Monday from this week to the kept one (V3)', () => {
    expect(change()?.freeze.map(toIsoDate)).toEqual(['2026-10-19', '2026-10-26', '2026-11-02']);
    expect(change([row('2026-10-26')])?.freeze.map(toIsoDate)).toEqual([
      '2026-10-19',
      '2026-11-02',
    ]);
  });

  it('never sends the submit Monday backwards: Thursday to Sunday on a Friday', () => {
    const found = change();
    const frozen = (found?.freeze ?? []).map((monday) => row(toIsoDate(monday)));
    const after = issueSlots(frozen, TODAY, SUNDAY);
    expect(toIsoDate(submitMonday(NOW, after, SUNDAY))).toBe('2026-11-02');
  });

  it('steps over a skipped Monday to keep the next open one', () => {
    expect(change([row('2026-11-02', 'skipped')])).toMatchObject({
      keep: '2026-11-09',
      from: '2026-11-16',
    });
  });

  it('changes nothing for the same rule', () => {
    expect(change([], { dayOffset: -4, time: parseWallTime('20:00') })).toBeNull();
  });

  it('refreezes the open rows from `from` still on the old rule, counted from their meeting', () => {
    const rows = [
      row('2026-11-02'),
      row('2026-11-09'),
      row('2026-11-16', 'open', undefined, '2026-11-18'),
      row('2026-11-23', 'open', new Date('2026-11-20T11:00:00Z')),
      row('2026-11-30', 'skipped'),
      row('2026-12-07', 'generated'),
    ];
    const picked = refreezable(rows, d('2026-11-09'), THURSDAY, SUNDAY);
    expect(picked.map(({ row: r, deadlineAt }) => [toIsoDate(r.monday), deadlineAt])).toEqual([
      ['2026-11-09', deadline(d('2026-11-09'), SUNDAY)],
      ['2026-11-16', deadline(d('2026-11-18'), SUNDAY)],
    ]);
  });
});
