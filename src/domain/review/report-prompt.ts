import { addDays, daysBetween, type CalDate } from '@/domain/time';

/** An akce is asked for its report on up to this many days after its last day, then no more. */
const PROMPT_DAYS = 21;
/** The second prompt goes from the eighth day after the last day on. */
const SECOND_PROMPT_DAY = 8;

/** The last days an akce can have ended on and still be prompted today (`today` is the Prague day). */
export function reportPromptWindow(today: CalDate): {
  readonly from: CalDate;
  readonly to: CalDate;
} {
  return { from: addDays(today, -PROMPT_DAYS), to: addDays(today, -1) };
}

/**
 * Which prompt an akce that ended on `lastDay` is due: the first from the day after, the second from
 * the eighth day after, none outside the window. The latest due one is sent, so an akce approved or
 * found late gets one mail, not two (design section 13).
 */
export function reportPromptStage(lastDay: CalDate, today: CalDate): 1 | 2 | null {
  const days = daysBetween(lastDay, today);
  if (days < 1 || days > PROMPT_DAYS) return null;
  return days >= SECOND_PROMPT_DAY ? 2 : 1;
}
