import type { JobCatalog, Tx } from '@/application/ports';
import { toIsoDate, type CalDate } from '@/domain/time';

import { authorsWaiting, activeSubmitters, reminderIssue, waitingAuthors } from './reminders';

/** The deadline as the keys count it: whole minutes, so one deadline has one key. */
const deadlineMinute = (deadlineAt: Date) => Math.floor(deadlineAt.getTime() / 60_000);

/** What the caller knows when it enqueues the moved mail: the recipient, the Monday and the new deadline. */
export interface MovedIds {
  readonly userId: string;
  readonly monday: CalDate;
  readonly deadlineAt: Date;
}

/** One mail per slot, person and deadline: a second move to another earlier deadline mails again. */
export const movedParts = ({ userId, monday, deadlineAt }: MovedIds) => ({
  recipientId: userId,
  subjectId: userId,
  key: `${toIsoDate(monday)}:${userId}:${deadlineMinute(deadlineAt)}`,
});

interface NoticeJob {
  readonly data: JobCatalog['issues.moved-notice'];
  readonly dedupeKey: string;
}

/**
 * The `issues.moved-notice` job a move enqueues (use cases enqueue through here, never through
 * application/jobs): ids and dates only, one job per slot and deadline.
 */
export function movedNoticeJob(monday: CalDate, deadlineAt: Date): NoticeJob {
  const iso = toIsoDate(monday);
  return {
    data: { monday: iso, deadlineAt: deadlineAt.toISOString() },
    dedupeKey: `issues.moved-notice:${iso}:${deadlineMinute(deadlineAt)}`,
  };
}

/**
 * Whom the moved mail is for: the reminders' audience of the slot being collected now, staff who
 * keep the soft reminder and every author of a draft or returned point. Empty when the job's slot
 * is no longer the one collected or its deadline is no longer the one the move set.
 */
export async function movedRecipients(
  tx: Pick<Tx, 'ctx' | 'issues' | 'points' | 'settings' | 'futureItems' | 'users'>,
  notice: JobCatalog['issues.moved-notice'],
): Promise<{ readonly monday: CalDate; readonly userIds: readonly string[] } | null> {
  const { now } = tx.ctx;
  const issue = await reminderIssue(tx, now);
  const current =
    toIsoDate(issue.monday) === notice.monday &&
    deadlineMinute(issue.deadlineAt) === deadlineMinute(new Date(notice.deadlineAt));
  if (!current) return null;
  const [submitters, waiting] = await Promise.all([
    activeSubmitters(tx, now),
    authorsWaiting(tx, issue.monday, now),
  ]);
  return { monday: issue.monday, userIds: [...new Set([...submitters, ...waiting])] };
}

/** What the moved mail is about at send time: the slot being collected now, with its new deadline. */
export interface MovedFacts {
  readonly monday: CalDate;
  readonly meetingDate: CalDate;
  readonly deadlineAt: Date;
  /** The recipient has a draft or returned point for it. */
  readonly hasWork: boolean;
}

/** Read again when the mail goes: the slot open now and whether the recipient waits on it. */
export async function loadMoved(
  tx: Pick<Tx, 'ctx' | 'issues' | 'points' | 'settings'>,
  userId: string,
): Promise<MovedFacts> {
  const { now } = tx.ctx;
  const issue = await reminderIssue(tx, now);
  const hasWork = (await waitingAuthors(tx, issue.monday, now)).includes(userId);
  return { ...issue, hasWork };
}
