/** Branch arch-ui only: the calendar as Arch reads it, and the porada each point is in. */
import { calendarBoundary, issueSlots, type DeadlineRule, type IssueRow } from '@/domain/calendar';
import { compareDates, parseIsoDate, type CalDate } from '@/domain/time';

/**
 * The calendar for Arch: the boundary (ADR 0054), the slots, and every porada, stored (any week)
 * or virtual, in Monday order: the ones a point can be in (`poradaMondayOf`).
 */
export function archCalendar(
  issueRows: readonly {
    monday: string;
    meetingDate: string;
    deadlineAt: Date;
    status: IssueRow['status'];
  }[],
  planned: string | null,
  today: CalDate,
  rule: DeadlineRule,
) {
  const calRows: IssueRow[] = issueRows.map((i) => ({
    monday: parseIsoDate(i.monday),
    meetingDate: parseIsoDate(i.meetingDate),
    deadlineAt: i.deadlineAt,
    status: i.status,
  }));
  const plannedThrough = calendarBoundary(planned ? parseIsoDate(planned) : null, today);
  const slots = issueSlots(calRows, today, rule, plannedThrough);
  const poradas = [...calRows, ...slots.filter((slot) => !slot.stored)].sort((a, b) =>
    compareDates(a.monday, b.monday),
  );
  return { plannedThrough, slots, poradas };
}

/**
 * The porada a point handed in for `handIn` is in, the one Arch lists and previews it under. A
 * point not yet printed is in the first open porada from its hand-in Monday on: the one whose
 * generation prints it by the cumulative rule (ADR 0029), also after a drop left the stored hand-in
 * Monday with no porada (ADR 0054 item 4). A published point is in the first generated one, which
 * printed it. The hand-in Monday when none follows. `poradas` are the calendar's poradas, stored
 * and virtual, in Monday order.
 */
export function poradaMondayOf(
  handIn: CalDate,
  published: boolean,
  poradas: readonly Pick<IssueRow, 'monday' | 'status'>[],
): CalDate {
  const status = published ? 'generated' : 'open';
  return (
    poradas.find((p) => p.status === status && compareDates(p.monday, handIn) >= 0)?.monday ??
    handIn
  );
}
