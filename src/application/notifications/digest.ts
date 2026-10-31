import type { Tx, UserRecord } from '@/application/ports';
import { atLeast } from '@/domain/actor';
import { digestSince, type DigestSlot } from '@/domain/calendar';
import { toIsoDate, type CalDate } from '@/domain/time';

import { isMember } from './reminders';

/** What the caller knows when it enqueues a digest: the reviewer, the Prague day and which of the day's two. */
export interface DigestIds {
  readonly userId: string;
  readonly date: CalDate;
  readonly slot: DigestSlot;
}

/** One digest per person, day and slot; the subject is the recipient, the counts are read again at send time. */
export const digestParts = ({ userId, date, slot }: DigestIds) => ({
  recipientId: userId,
  subjectId: userId,
  key: `${userId}:${toIsoDate(date)}:${slot}`,
});

type Reviewer = Pick<UserRecord, 'role' | 'status'>;

/** Someone who can sign in and review: a reviewer or the headmaster. */
export const isReviewer = (user: Reviewer) => isMember(user) && atLeast(user.role, 'reviewer');

/** What is new for a reviewer. Access requests are the headmaster's to decide, so only they count them. */
export interface DigestFacts {
  readonly submitted: number;
  readonly accessRequests: number;
}

/** Something to tell: a mail with two zeros would say nothing. */
export const hasNews = ({ submitted, accessRequests }: DigestFacts) =>
  submitted > 0 || accessRequests > 0;

/**
 * What came in since the reviewer's last digest was sent (the ledger is the watermark, a day back
 * for someone never mailed): points and akce waiting for review that others handed in, and for the
 * headmaster the access requests still pending. Counts only, by the columns the worker is granted.
 * The window has no upper bound: an item handed in between the claim and this count shows in two
 * digests, a rare double count of milliseconds' width (the claim instant is the next watermark).
 */
export async function digestFacts(
  tx: Pick<Tx, 'ctx' | 'points' | 'futureItems' | 'accessRequests' | 'mailLedger'>,
  user: Pick<UserRecord, 'id' | 'role'>,
): Promise<DigestFacts> {
  const since = digestSince(await tx.mailLedger.lastSent('reviewer.digest', user.id), tx.ctx.now);
  const query = { since, notBy: user.id };
  const [points, items, requests] = await Promise.all([
    tx.points.countSubmittedSince(query),
    tx.futureItems.countSubmittedSince(query),
    user.role === 'headmaster' ? tx.accessRequests.countPendingSince(since) : 0,
  ]);
  return { submitted: points + items, accessRequests: requests };
}

/** The digest mail's subject: the recipient's counts as they stand when the mail goes. */
export async function loadDigest(
  tx: Pick<Tx, 'ctx' | 'users' | 'points' | 'futureItems' | 'accessRequests' | 'mailLedger'>,
  userId: string,
): Promise<DigestFacts | null> {
  const user = await tx.users.get(userId);
  return user && digestFacts(tx, user);
}
