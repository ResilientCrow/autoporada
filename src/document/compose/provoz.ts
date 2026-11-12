import { eventEndedBefore } from '@/domain/calendar';
import { csCollator } from '@/domain/cs';
import { compareDates, parseIsoDate, parseWallTime } from '@/domain/time';
import type { SnapshotReport } from '@/snapshot';

import type { Block } from '../model';
import type { ComposeContext } from './context';
import { futureBullet } from './future';
import { reportBlocks } from './report';
import { point } from './text';

const minutes = (t?: string) => (t ? parseWallTime(t).hour * 60 + parseWallTime(t).minute : -1);

/** Oldest first: event date, start time, title (plan §1). */
function compareReports(a: SnapshotReport, b: SnapshotReport): number {
  return (
    compareDates(parseIsoDate(a.date), parseIsoDate(b.date)) ||
    minutes(a.timeFrom) - minutes(b.timeFrom) ||
    csCollator.compare(a.title, b.title)
  );
}

/** Reports of finished events, oldest first, then „Další doposud známé akce školy“. */
export function composeProvoz(ctx: ComposeContext): Block[] {
  const reports = ctx.snapshot.reports
    .filter((r) =>
      eventEndedBefore(
        { date: parseIsoDate(r.date), ...(r.endDate && { endDate: parseIsoDate(r.endDate) }) },
        ctx.meeting,
      ),
    )
    .sort(compareReports);
  const later =
    ctx.future.later.length > 0
      ? point(
          'Další doposud známé akce školy',
          ctx.future.later.map((item) => futureBullet(item)),
        )
      : [];
  return [
    ...reports.flatMap((r) =>
      reportBlocks(r, { groupOrder: ctx.snapshot.options.groupOrder, tokens: ctx.tokens }),
    ),
    ...later,
  ];
}
