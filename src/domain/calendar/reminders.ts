import {
  addDays,
  calDate,
  instantToWallClock,
  parseWallTime,
  wallClockToInstant,
  type CalDate,
} from '@/domain/time';

/** The soft reminder comes two days before the deadline, the hard one on its day (design section 13). */
export type ReminderKind = 'soft' | 'hard';

const SLOTS = {
  soft: { daysBefore: 2, at: parseWallTime('13:00') },
  hard: { daysBefore: 0, at: parseWallTime('12:00') },
} as const;

const HOLD_MS = 6 * 3_600_000;
/** Recipients are spread over this long after the slot, so the mail gate is not hit all at once. */
export const REMINDER_STAGGER_MS = 30 * 60_000;
/** Only drafts touched within this many days are worth a reminder. */
export const REMINDER_DRAFT_DAYS = 28;

/** When the reminder opens: its wall time on the Prague day that many days before the deadline's. */
export function reminderSlot(kind: ReminderKind, deadlineAt: Date): Date {
  const { daysBefore, at } = SLOTS[kind];
  return wallClockToInstant(addDays(instantToWallClock(deadlineAt).date, -daysBefore), at);
}

/** Due from the slot until six hours later, and never at or after the deadline. */
export function reminderDue(kind: ReminderKind, deadlineAt: Date, now: Date): boolean {
  const slot = reminderSlot(kind, deadlineAt).getTime();
  const end = Math.min(slot + HOLD_MS, deadlineAt.getTime());
  return slot <= now.getTime() && now.getTime() < end;
}

/** A fixed offset of 0 to 30 minutes from the recipient's id (FNV-1a), so a rerun picks the same time. */
export function reminderStagger(recipientId: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < recipientId.length; i++) {
    hash = Math.imul(hash ^ recipientId.charCodeAt(i), 0x01000193) >>> 0;
  }
  return (hash % (REMINDER_STAGGER_MS / 1000)) * 1000;
}

/** The start of the school year of `day`: 1 September, Prague midnight. A submitter is active if they handed in something since. */
export function activeSince(day: CalDate): Date {
  const year = day.month >= 9 ? day.year : day.year - 1;
  return wallClockToInstant(calDate(year, 9, 1), parseWallTime('00:00'));
}
