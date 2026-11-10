import { readReportsSince, readSettingValue, readSlots } from '@/application/core';
import type { Tx, UserRecord } from '@/application/ports';
import {
  eventEnd,
  handInSlot,
  REMINDER_DRAFT_DAYS,
  reminderDue,
  type ReminderKind,
} from '@/domain/calendar';
import { instantToWallClock, toIsoDate, type CalDate } from '@/domain/time';

type Member = Pick<UserRecord, 'role' | 'status'>;

/** Someone who can sign in and read what the mail says. */
export const isMember = (user: Member) => user.role !== 'pending' && user.status === 'active';

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
  /** The effective boundary (ADR 0054): the look-back steps over Mondays with no porada up to it. */
  readonly plannedThrough: CalDate;
}

/**
 * The Monday that submissions go to now, with its frozen deadline or else the rule's: the first
 * open slot whose deadline is still ahead, so a generated Monday is stepped over and its successor
 * is the one reminded. Reads only the columns migrations 0024, 0025 and 0030 grant the worker
 * (the rule through `settings.value`, never the version).
 */
export async function reminderIssue(
  tx: Pick<Tx, 'issues' | 'settings'>,
  now: Date,
): Promise<ReminderIssue> {
  const { slots, rule, plannedThrough } = await readSlots(tx, now);
  const { monday, meetingDate, deadlineAt } = handInSlot(
    now,
    slots,
    rule,
    undefined,
    plannedThrough,
  );
  return { monday, meetingDate, deadlineAt, plannedThrough };
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

/**
 * Authors of an approved akce that has ended and whose report is not handed in yet, for the issue's
 * porada (ADR 0046): its last day is on or after the meeting day of the porada before, so a report
 * an earlier porada was owed is late (`reports.late`), not reminded here.
 */
export async function owingAuthors(
  tx: Pick<Tx, 'issues' | 'futureItems'>,
  issue: ReminderIssue,
  now: Date,
): Promise<readonly string[]> {
  const since = await readReportsSince(tx, issue.monday, issue.plannedThrough);
  const today = instantToWallClock(now).date;
  const owed = await tx.futureItems.reportsOwed({ from: since, to: today });
  const ended = owed.filter((item) => eventEnd(item).getTime() <= now.getTime());
  return [...new Set(ended.map((item) => item.authorId))];
}

/** Everyone who owes the issue's porada a report, students too: the soft reminder's audience. */
export async function authorsOwing(
  tx: Pick<Tx, 'issues' | 'futureItems' | 'users'>,
  issue: ReminderIssue,
  now: Date,
): Promise<readonly string[]> {
  const users = await tx.users.getMany(await owingAuthors(tx, issue, now));
  return users.filter(isMember).map((user) => user.id);
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
  /**
   * The recipient still has the work this kind is about: a report owed for the soft one, a draft
   * or returned point for the hard one.
   */
  readonly hasWork: boolean;
}

/**
 * Read again when the mail is about to go: the slot of this kind must still be open for the Monday
 * collected now (a mail held up past its window says something false), and the recipient must
 * still have the work (`hasWork`). A kind the headmaster switched off after the mail was queued is
 * dropped too. No one can switch the reminders off for themselves (ADR 0046).
 */
export async function loadReminder(
  tx: Pick<Tx, 'ctx' | 'issues' | 'points' | 'futureItems' | 'settings'>,
  kind: ReminderKind,
  userId: string,
): Promise<ReminderFacts | null> {
  const { now } = tx.ctx;
  if (!(await readSettingValue(tx, 'reminders'))[kind]) return null;
  const issue = await reminderIssue(tx, now);
  if (!reminderDue(kind, issue.deadlineAt, now)) return null;
  const authors =
    kind === 'soft' ? await owingAuthors(tx, issue, now) : await waitingAuthors(tx, issue, now);
  const hasWork = authors.includes(userId);
  return { monday: issue.monday, meetingDate: issue.meetingDate, hasWork };
}
