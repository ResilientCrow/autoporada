import { DEADLINE_RULE, readSlots } from '@/application/core';
import type { Tx, UserRecord } from '@/application/ports';
import { handInSlot, REMINDER_DRAFT_DAYS, reminderDue, type ReminderKind } from '@/domain/calendar';
import { toIsoDate, type CalDate } from '@/domain/time';

type Member = Pick<UserRecord, 'role' | 'status'>;

/** Someone who can sign in and read what the mail says. */
export const isMember = (user: Member) => user.role !== 'pending' && user.status === 'active';

/** The soft reminder is for staff who have not switched it off; students get only the hard one (D7 (a)). */
export const wantsSoftReminder = (
  user: Member & Pick<UserRecord, 'isStudent' | 'remindDeadline'>,
) => isMember(user) && !user.isStudent && user.remindDeadline;

/** What the caller knows when it enqueues a reminder: the recipient and the meeting Monday it is about. */
export interface ReminderIds {
  readonly userId: string;
  readonly monday: CalDate;
}

/** One reminder of each kind per Monday and person; the subject is the recipient, the Monday is read again at send time. */
export const reminderParts = ({ userId, monday }: ReminderIds) => ({
  recipientId: userId,
  subjectId: userId,
  key: `${toIsoDate(monday)}:${userId}`,
});

/** The issue a reminder speaks for: the Monday being collected for now, and when it closes. */
export interface ReminderIssue {
  readonly monday: CalDate;
  readonly deadlineAt: Date;
}

/**
 * The Monday that submissions go to now, with its frozen deadline or else the rule's: the first
 * open slot whose deadline is still ahead, so a skipped Monday is stepped over and its successor
 * is the one reminded. Reads only the columns migrations 0024 and 0025 grant the worker.
 */
export async function reminderIssue(tx: Pick<Tx, 'issues'>, now: Date): Promise<ReminderIssue> {
  const slots = await readSlots(tx, now);
  const { monday, deadlineAt } = handInSlot(now, slots, DEADLINE_RULE);
  return { monday, deadlineAt };
}

/** Authors of a draft changed in the last 28 days or of a returned point that can still go to `monday`. */
export function waitingAuthors(tx: Pick<Tx, 'points'>, monday: CalDate, now: Date) {
  const draftsSince = new Date(now.getTime() - REMINDER_DRAFT_DAYS * 86_400_000);
  return tx.points.reminderAuthors({ draftsSince, monday });
}

/** What a reminder mail is about at send time (see `loadReminder`). */
export interface ReminderFacts {
  /** The meeting Monday whose slot is open now. */
  readonly monday: CalDate;
  /** The recipient has a draft or returned point for it; read for the hard reminder only. */
  readonly hasWork: boolean;
}

/**
 * Read again when the mail is about to go: the slot of this kind must still be open for the Monday
 * collected now (a mail held up past its window says something false), and the hard reminder needs
 * the recipient still to have a draft or returned point.
 */
export async function loadReminder(
  tx: Pick<Tx, 'ctx' | 'issues' | 'points'>,
  kind: ReminderKind,
  userId: string,
): Promise<ReminderFacts | null> {
  const { now } = tx.ctx;
  const issue = await reminderIssue(tx, now);
  if (!reminderDue(kind, issue.deadlineAt, now)) return null;
  const hasWork = kind === 'hard' && (await waitingAuthors(tx, issue.monday, now)).includes(userId);
  return { monday: issue.monday, hasWork };
}
