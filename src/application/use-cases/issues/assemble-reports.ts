import type { PointRecord } from '@/application/ports';
import { reportFromContent } from '@/document';
import { singleLine } from '@/domain/richtext';
import { toIsoDate, toIsoTime } from '@/domain/time';
import type { SnapshotReport } from '@/snapshot';

import type { AssemblyProblem } from './assemble-types';

/**
 * The eligible reports as the snapshot's reports. A submitted point passed readiness, so
 * `reportFromContent` leaves nothing out and changes no date or time (C33 F4); a report that does
 * not hold to that is left out and named as a problem instead of printed wrong.
 */
export function assembleReports(points: readonly PointRecord[]): {
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
    if (whole) reports.push(report);
    else
      problems.push({ code: 'report-incomplete', pointId: point.id, title: singleLine(c.title) });
  }
  return { reports, problems };
}
