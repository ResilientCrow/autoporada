/**
 * What the app words for the porada a new point goes to (the standing line), worked out the way
 * the app does it, from its calendar functions and copy. Free of Playwright, so a probe can
 * compare it with the app's own `standingOf` for any instant.
 */
import { deadline, DEFAULT_DEADLINE, placementMonday, submitMonday } from '@/domain/calendar';
import { formatDayMonth, formatTime, weekdayName } from '@/domain/cs';
import { addDays, instantToWallClock } from '@/domain/time';
import { points } from '@/ui/copy';

/**
 * The standing line of a draft as the app words it at `now`, in both of its variants: before the
 * deadline of the porada it goes to, or, from Sunday 18.00 to the end of Monday, after the
 * deadline of the porada just held. Worked out with the app's own calendar functions and copy, on
 * the same real clock the server reads, so it is right on any day: the porada is the first Monday
 * from the submit Monday that is open (no skipped Monday lies that near), and it is the same in
 * both variants; only the sentence about its deadline differs.
 */
export function standingLines(now: Date): { before: string; closed: string } {
  const first = submitMonday(now, DEFAULT_DEADLINE, []);
  const placement = placementMonday(first, now, []);
  if (placement === null) throw new Error('no porada is open');
  const { date, time } = instantToWallClock(deadline(placement, DEFAULT_DEADLINE));
  return {
    before: points.standing.before(
      formatDayMonth(placement),
      weekdayName(date),
      formatDayMonth(date),
      formatTime(time),
    ),
    closed: points.standing.closed(formatDayMonth(addDays(first, -7)), formatDayMonth(placement)),
  };
}
