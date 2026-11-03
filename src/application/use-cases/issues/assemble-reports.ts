import type { FutureItemRecord, PointRecord } from '@/application/ports';
import { reportFromContent } from '@/document';
import { singleLine } from '@/domain/richtext';
import { toIsoDate, toIsoTime } from '@/domain/time';
import type { SnapshotReport } from '@/snapshot';

import { akceDays } from './assemble-missing';
import type { AssemblyProblem } from './assemble-types';

/**
 * The eligible reports as the snapshot's reports. A submitted point passed readiness, so
 * `reportFromContent` leaves nothing out and changes no date or time (C33 F4); a report that does
 * not hold to that is left out and named as a problem instead of printed wrong. A report that
 * answers an owed akce (`akce`, by the point's id) is dated by the akce, as the porada took it in by
 * the akce's days (ADR 0049): the document's PROVOZ filter and order then follow the same days.
 */
export function assembleReports(
  points: readonly PointRecord[],
  akce: ReadonlyMap<string, FutureItemRecord>,
): {
  readonly reports: SnapshotReport[];
  readonly problems: AssemblyProblem[];
} {
  const reports: SnapshotReport[] = [];
  const problems: AssemblyProblem[] = [];
  for (const point of points) {
    if (point.kind !== 'report') continue;
    const c = point.content;
    const { report, omitted } = reportFromContent(c, { id: point.id });
    const whole =
      report !== null &&
      omitted.people === 0 &&
      omitted.peopleBullets === 0 &&
      omitted.textBullets === 0 &&
      omitted.statements === 0 &&
      c.eventDate !== null &&
      report.date === toIsoDate(c.eventDate) &&
      report.endDate === (c.endDate ? toIsoDate(c.endDate) : undefined) &&
      report.timeFrom === (c.timeFrom ? toIsoTime(c.timeFrom) : undefined) &&
      report.timeTo === (c.timeTo ? toIsoTime(c.timeTo) : undefined);
    if (whole) reports.push(datedByAkce(report, akce.get(point.id)));
    else
      problems.push({ code: 'report-incomplete', pointId: point.id, title: singleLine(c.title) });
  }
  return { reports, problems };
}

/** The report with the days of the akce it answers, when it answers one that has a start date. */
function datedByAkce(report: SnapshotReport, akce: FutureItemRecord | undefined): SnapshotReport {
  const days = akce && akceDays(akce);
  if (!days) return report;
  const { endDate: _own, ...rest } = report;
  return {
    ...rest,
    date: toIsoDate(days.start),
    ...(days.end && { endDate: toIsoDate(days.end) }),
  };
}
