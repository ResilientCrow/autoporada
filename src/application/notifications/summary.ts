import { readSlots } from '@/application/core';
import type { Tx, UserRecord } from '@/application/ports';
import { pointMonday, summaryDue, type IssueRow } from '@/domain/calendar';
import { instantToWallClock, isSameDate, toIsoDate, type CalDate } from '@/domain/time';

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
 * migrations 0024 and 0025 grant the worker.
 */
export async function summaryIssue(tx: Pick<Tx, 'issues'>, now: Date): Promise<IssueRow | null> {
  const rows = await tx.issues.calendar(instantToWallClock(now).date);
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
  const [rows, handedIn] = await Promise.all([readSlots(tx, now), tx.points.handedInFor(monday)]);
  const slots = rows.map((slot) =>
    isSameDate(slot.monday, monday) ? { ...slot, status: 'open' as const } : slot,
  );
  const counts = { submitted: 0, approved: 0, returned: 0 };
  const today = instantToWallClock(now).date;
  for (const { state, earliestMonday, handInMonday } of handedIn) {
    const placed = pointMonday({ earliest: earliestMonday, handIn: handInMonday }, today, slots);
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
