import type { Tx } from '@/application/ports';
import {
  isLateReport,
  reportCloses,
  summaryDue,
  type IssueRow,
  type LateFacts,
} from '@/domain/calendar';
import { addDays, instantToWallClock, isSameDate, toIsoDate, type CalDate } from '@/domain/time';

/** The late reports of one porada (ADR 0035): counts and the last close, never titles (F2). */
export interface LateReports {
  /** Late and not handed in: akce without a report, drafts and returned reports. */
  readonly expected: number;
  /** Late and handed in for this porada. */
  readonly handedIn: number;
  /** The latest close among them; null when the porada has no late report. */
  readonly lastDue: Date | null;
}

type Reads = Pick<Tx, 'futureItems' | 'points'>;

/**
 * The reports about events that end before the meeting day and are late for `issue`: read from
 * the day before its deadline (the earliest end that can still be late) to the day before the
 * meeting, then sorted out by `isLateReport`, the rule the editor and submit use.
 */
export async function lateReportsFor(tx: Reads, issue: IssueRow): Promise<LateReports> {
  const window = {
    from: addDays(instantToWallClock(issue.deadlineAt).date, -1),
    to: addDays(issue.meetingDate, -1),
  };
  const [akce, reports] = await Promise.all([
    tx.futureItems.reportsEnding(window),
    tx.points.reportPoints(window),
  ]);
  const late: { facts: LateFacts; handedIn: boolean }[] = [
    ...akce.map((item) => ({ facts: item, handedIn: false })),
    ...reports.map((point) => ({
      facts: point,
      handedIn:
        (point.state === 'submitted' ||
          point.state === 'approved' ||
          point.state === 'published') &&
        point.handInMonday !== null &&
        isSameDate(point.handInMonday, issue.monday),
    })),
  ].filter(({ facts }) => isLateReport(issue, facts));
  const closes = late.map(({ facts }) => reportCloses(issue, facts).getTime());
  return {
    expected: late.filter(({ handedIn }) => !handedIn).length,
    handedIn: late.filter(({ handedIn }) => handedIn).length,
    lastDue: closes.length > 0 ? new Date(Math.max(...closes)) : null,
  };
}

/**
 * The porada whose last late close passed five minutes to two hours ago and that had late
 * reports, with their counts: what the second summary speaks for.
 */
export async function lateSummaryIssue(
  tx: Reads & Pick<Tx, 'issues'>,
  now: Date,
): Promise<{ readonly issue: IssueRow; readonly late: LateReports } | null> {
  const rows = await tx.issues.calendar(instantToWallClock(now).date);
  for (const issue of rows) {
    if (issue.deadlineAt.getTime() > now.getTime()) continue;
    const late = await lateReportsFor(tx, issue);
    if (late.lastDue && summaryDue(late.lastDue, now)) return { issue, late };
  }
  return null;
}

/** What the second summary is about at send time. */
export interface LateSummaryFacts {
  readonly monday: CalDate;
  readonly meetingDate: CalDate;
  readonly handedIn: number;
  readonly missing: number;
}

/** One second summary per headmaster and porada; the subject is the recipient, the porada is read again at send time. */
export const lateSummaryParts = ({ userId, monday }: { userId: string; monday: CalDate }) => ({
  recipientId: userId,
  subjectId: userId,
  key: `${userId}:${toIsoDate(monday)}`,
});

/** Read again when the mail goes: null when the porada has no late summary due now. */
export async function loadLateSummary(
  tx: Reads & Pick<Tx, 'issues' | 'ctx'>,
): Promise<LateSummaryFacts | null> {
  const found = await lateSummaryIssue(tx, tx.ctx.now);
  if (!found) return null;
  const { issue, late } = found;
  return {
    monday: issue.monday,
    meetingDate: issue.meetingDate,
    handedIn: late.handedIn,
    missing: late.expected,
  };
}
