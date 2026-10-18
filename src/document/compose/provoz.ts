import { eventEndedBefore } from '@/domain/calendar';
import { csCollator, renderPeople, type Salutation } from '@/domain/cs';
import { compareDates, parseIsoDate, parseWallTime } from '@/domain/time';
import type { SnapshotBullet, SnapshotReport } from '@/snapshot';

import type { Block } from '../model';
import type { ComposeContext } from './context';
import { futureBullet } from './future';
import { finalRuns, finalText, point, quoted, richBlocks } from './text';

const minutes = (t?: string) => (t ? parseWallTime(t).hour * 60 + parseWallTime(t).minute : -1);

/** Oldest first: event date, start time, title (plan §1). */
function compareReports(a: SnapshotReport, b: SnapshotReport): number {
  return (
    compareDates(parseIsoDate(a.date), parseIsoDate(b.date)) ||
    minutes(a.timeFrom) - minutes(b.timeFrom) ||
    csCollator.compare(a.title, b.title)
  );
}

function bulletLine(bullet: SnapshotBullet, groupOrder?: readonly Salutation[]): Block {
  const text =
    bullet.kind === 'text'
      ? bullet.text
      : renderPeople(bullet.people, {
          join: 'comma',
          order: bullet.order,
          ...(groupOrder && { groupOrder }),
        });
  return {
    kind: 'reportLine',
    label: finalText(`${bullet.label}:`),
    runs: finalRuns([{ text: ` ${text}` }]),
  };
}

function reportBlocks(report: SnapshotReport, ctx: ComposeContext): Block[] {
  const groupOrder = ctx.snapshot.options.groupOrder;
  return point(report.title, [
    ...richBlocks(report.body, ctx.tokens),
    ...report.bullets.map((b) => bulletLine(b, groupOrder)),
    ...report.statements.map((s) => ({
      kind: 'reportLine' as const,
      label: finalText(
        `vyjádření ${s.speakerGenitive}${s.affiliation ? ` (${s.affiliation})` : ''}:`,
      ),
      runs: finalRuns([{ text: ` ${quoted(s.quote)}` }]),
    })),
  ]);
}

/** Reports of finished events, oldest first, then „Další doposud známé akce školy“. */
export function composeProvoz(ctx: ComposeContext): Block[] {
  const reports = ctx.snapshot.reports
    .filter((r) =>
      eventEndedBefore(
        { date: parseIsoDate(r.date), ...(r.endDate && { endDate: parseIsoDate(r.endDate) }) },
        ctx.monday,
      ),
    )
    .sort(compareReports);
  const later =
    ctx.future.later.length > 0
      ? point('Další doposud známé akce školy', ctx.future.later.map(futureBullet))
      : [];
  return [...reports.flatMap((r) => reportBlocks(r, ctx)), ...later];
}
