import { instantToWallClock } from '@/domain/time';

/** The reviewer digest goes out twice a day, at 07.00 and 15.00 Prague time (design section 13). */
export type DigestSlot = '07' | '15';

/** Whoever has never been mailed a digest is told what came in during the last day. */
export const DIGEST_FALLBACK_MS = 24 * 3_600_000;

const AFTERNOON_FROM = 15;

/**
 * Which of the day's two digests `now` belongs to, by the Prague clock: before 15.00 the morning
 * one, after it the afternoon one. A run held up by an outage still files under its own slot.
 */
export function digestSlot(now: Date): DigestSlot {
  return instantToWallClock(now).time.hour < AFTERNOON_FROM ? '07' : '15';
}

/** Where a digest's count starts: the claim of the last one sent to the person, else a day back. */
export function digestSince(lastSent: Date | null, now: Date): Date {
  return lastSent ?? new Date(now.getTime() - DIGEST_FALLBACK_MS);
}
