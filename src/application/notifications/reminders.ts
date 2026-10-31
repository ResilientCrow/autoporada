import { readSettingValue, readSlots } from '@/application/core';
import type { Tx, UserRecord } from '@/application/ports';
import {
  activeSince,
  handInSlot,
  REMINDER_DRAFT_DAYS,
  reminderDue,
  type ReminderKind,
} from '@/domain/calendar';
import { instantToWallClock, toIsoDate, type CalDate } from '@/domain/time';

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
  /** The day that porada is held: what the mail names. */
  readonly meetingDate: CalDate;
  readonly deadlineAt: Date;
}

/**
 * The Monday that submissions go to now, with its frozen deadline or else the rule's: the first
 * open slot whose deadline is still ahead, so a skipped Monday is stepped over and its successor
 * is the one reminded. Reads only the columns migrations 0024, 0025 and 0030 grant the worker
 * (the rule through `settings.value`, never the version).
 */
export async function reminderIssue(
  tx: Pick<Tx, 'issues' | 'settings'>,
  now: Date,
): Promise<ReminderIssue> {
  const { slots, rule } = await readSlots(tx, now);
  const { monday, meetingDate, deadlineAt } = handInSlot(now, slots, rule);
  return { monday, meetingDate, deadlineAt };
}

/**
 * Authors of a draft changed in the last 28 days or of a returned point that can still go to the
 * issue's Monday, except those whose report is late for it: a late report has its own mails.
 */
export function waitingAuthors(tx: Pick<Tx, 'points'>, issue: ReminderIssue, now: Date) {
  const draftsSince = new Date(now.getTime() - REMINDER_DRAFT_DAYS * 86_400_000);
  const { monday, meetingDate, deadlineAt } = issue;
  return tx.points.reminderAuthors({ draftsSince, monday, meetingDate, deadlineAt });
}

/** Staff who handed in a point or an akce this school year (D7 (a)), by granted columns only. */
export async function activeSubmitters(
  tx: Pick<Tx, 'points' | 'futureItems' | 'users'>,
  now: Date,
): Promise<readonly string[]> {
  const since = activeSince(instantToWallClock(now).date);
  const [authors, organisers] = await Promise.all([
    tx.points.submitterIds(since),
    tx.futureItems.submitterIds(since),
  ]);
  const users = await tx.users.getMany([...new Set([...authors, ...organisers])]);
  return users.filter(wantsSoftReminder).map((user) => user.id);
}

/** Everyone with a draft or returned point for the Monday, students too: it is about their own work. */
export async function authorsWaiting(
  tx: Pick<Tx, 'points' | 'users'>,
  issue: ReminderIssue,
  now: Date,
): Promise<readonly string[]> {
  const users = await tx.users.getMany(await waitingAuthors(tx, issue, now));
  return users.filter(isMember).map((user) => user.id);
}

/** What a reminder mail is about at send time (see `loadReminder`). */
export interface ReminderFacts {
  /** The meeting Monday whose slot is open now. */
  readonly monday: CalDate;
  /** The day it is held. */
  readonly meetingDate: CalDate;
  /** The recipient has a draft or returned point for it; read for the hard reminder only. */
  readonly hasWork: boolean;
}

/**
 * Read again when the mail is about to go: the slot of this kind must still be open for the Monday
 * collected now (a mail held up past its window says something false), and the hard reminder needs
 * the recipient still to have a draft or returned point. A kind the headmaster switched off after
 * the mail was queued is dropped too; the user's own opt-out is checked where the mail is queued.
 */
export async function loadReminder(
  tx: Pick<Tx, 'ctx' | 'issues' | 'points' | 'settings'>,
  kind: ReminderKind,
  userId: string,
): Promise<ReminderFacts | null> {
  const { now } = tx.ctx;
  if (!(await readSettingValue(tx, 'reminders'))[kind]) return null;
  const issue = await reminderIssue(tx, now);
  if (!reminderDue(kind, issue.deadlineAt, now)) return null;
  const hasWork = kind === 'hard' && (await waitingAuthors(tx, issue, now)).includes(userId);
  return { monday: issue.monday, meetingDate: issue.meetingDate, hasWork };
}
