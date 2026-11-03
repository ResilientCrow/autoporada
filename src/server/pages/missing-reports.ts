import type { z } from 'zod';

import { issueMissingReports } from '@/application/use-cases';
import type { missingReportsOutput } from '@/contracts';
import { MISSING_REPORT_LINES } from '@/document';
import { formatNumericDate, formatNumericRange, formatTitleDate } from '@/domain/cs';
import { can } from '@/domain/policy';
import { parseIsoDate } from '@/domain/time';

import { orNotFound } from './not-found';
import { runPage } from './run-page';
import { getViewer, requestId } from './viewer';

type Read = z.output<typeof missingReportsOutput>;

/** /porada/[datum]/zpravy: the akce whose report the porada lacks, each with its dates written out. */
export interface MissingReportsPageModel {
  /** „pondělí 9. listopadu 2026“. */
  readonly meeting: string;
  readonly monday: string;
  /** False for a generated or skipped porada: the page shows no form. */
  readonly open: boolean;
  /** The two fixed lines the document adds under a placeholder, which the form shows read-only. */
  readonly lines: readonly string[];
  readonly reports: readonly (Omit<Read['reports'][number], 'startDate' | 'endDate'> & {
    /** „4. 11. 2026“, or „5.–6. 11. 2026“ for an akce of several days. */
    readonly dates: string;
  })[];
}

/** The headmaster only; a Monday outside the calendar is a 404 too. */
export async function missingReportsPage(datum: string): Promise<MissingReportsPageModel | null> {
  const viewer = await getViewer();
  if (!viewer || !can(viewer.actor, { action: 'issue.edit' })) return null;
  const read = orNotFound(
    'issues.missingReports',
    await runPage(issueMissingReports, {
      principal: viewer,
      requestId: await requestId(),
      input: { monday: datum },
    }),
  );
  if (read === null) return null;
  return {
    meeting: formatTitleDate(parseIsoDate(read.meetingDate)),
    monday: read.monday,
    open: read.open,
    lines: MISSING_REPORT_LINES,
    reports: read.reports.map(({ startDate, endDate, ...report }) => {
      const start = parseIsoDate(startDate);
      return {
        ...report,
        dates:
          endDate === null
            ? formatNumericDate(start)
            : formatNumericRange(start, parseIsoDate(endDate)),
      };
    }),
  };
}
