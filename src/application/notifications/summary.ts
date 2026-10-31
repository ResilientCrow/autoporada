import { DEADLINE_RULE } from '@/application/core';
import type { Tx, UserRecord } from '@/application/ports';
import { pointMonday, summaryDue, PLACEMENT_WEEKS, type KnownIssue } from '@/domain/calendar';
import {
  addDays,
  instantToWallClock,
  isSameDate,
  mondayOf,
  toIsoDate,
  type CalDate,
} from '@/domain/time';

import { isMember } from './reminders';

/** What the caller knows when it enqueues a summary: the headmaster and the meeting Monday it speaks for. */
export interface SummaryIds {
  readonly userId: string;
  readonly monday: CalDate;
}

/** One summary per headmaster and issue; the subject is the recipient, the issue is read again at send time. */
export const summaryParts = ({ userId, monday }: SummaryIds) => ({
  recipientId: userId,
  subjectId: userId,
  key: `${userId}:${toIsoDate(monday)}`,
});

/** Someone who can sign in as the headmaster, the only reader of a summary. */
export const isHeadmaster = (user: Pick<UserRecord, 'role' | 'status'>) =>
  isMember(user) && user.role === 'headmaster';

/**
 * The issue whose deadline passed five minutes to two hours ago, with the rest of its row: none
 * when no row is in that window or the meeting does not take place (skipped). Only the columns
 * migration 0024 grants the worker.
 */
export async function summaryIssue(tx: Pick<Tx, 'issues'>, now: Date): Promise<KnownIssue | null> {
  const from = mondayOf(instantToWallClock(now).date);
  const rows = await tx.issues.deadlines(from, addDays(from, 14));
  return rows.find((row) => summaryDue(row.deadlineAt, now) && row.status !== 'skipped') ?? null;
}

/** What a summary mail is about at send time: the meeting and where its points stand. */
export interface SummaryFacts {
  readonly monday: CalDate;
  readonly approved: number;
  readonly pending: number;
  readonly returned: number;
}

/**
 * The points that go to the Monday, counted by state: placed as the lists place them (`pointMonday`),
 * except that the issue itself counts as open, so a generated issue still counts what it holds.
 */
async function summaryFacts(
  tx: Pick<Tx, 'points' | 'issues' | 'ctx'>,
  monday: CalDate,
): Promise<SummaryFacts> {
  const { now } = tx.ctx;
  const from = mondayOf(instantToWallClock(now).date);
  const [rows, handedIn] = await Promise.all([
    tx.issues.deadlines(from, addDays(from, 7 * PLACEMENT_WEEKS)),
    tx.points.handedInFor(monday),
  ]);
  const known = rows.map((row) =>
    isSameDate(row.monday, monday) ? { ...row, status: 'open' as const } : row,
  );
  const counts = { submitted: 0, approved: 0, returned: 0 };
  for (const { state, earliestMonday, submittedAt } of handedIn) {
    const placed = pointMonday(
      { earliest: earliestMonday, submittedAt },
      DEADLINE_RULE,
      now,
      known,
    );
    if (placed && isSameDate(placed, monday)) counts[state] += 1;
  }
  return {
    monday,
    approved: counts.approved,
    pending: counts.submitted,
    returned: counts.returned,
  };
}

/** The summary mail's subject, the same for every headmaster: the issue closing now, with its counts as they stand when the mail goes. */
export async function loadSummary(
  tx: Pick<Tx, 'ctx' | 'issues' | 'points'>,
): Promise<SummaryFacts | null> {
  const issue = await summaryIssue(tx, tx.ctx.now);
  return issue && summaryFacts(tx, issue.monday);
}
