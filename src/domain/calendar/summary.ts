const OPENS_AFTER_MS = 5 * 60_000;
const CLOSES_AFTER_MS = 2 * 3_600_000;

/**
 * Whether the headmaster's summary of the issue is due: from five minutes after its deadline, so
 * the last hand-ins are in, until two hours after it, when the summary would be stale news
 * (design section 13).
 */
export function summaryDue(deadlineAt: Date, now: Date): boolean {
  const since = now.getTime() - deadlineAt.getTime();
  return since >= OPENS_AFTER_MS && since < CLOSES_AFTER_MS;
}
