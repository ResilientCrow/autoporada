import { defineUseCase, fail, ok, type ResourceAccess } from '@/application/core';
import type { FutureItemRecord } from '@/application/ports';
import {
  declineFutureReportInput,
  declineFutureReportOutput,
  startFutureReportInput,
  startFutureReportOutput,
} from '@/contracts';
import type { Check } from '@/domain/policy';
import { DRAFT_CAP } from '@/domain/report';
import { reportDue } from '@/domain/review';
import { instantToWallClock } from '@/domain/time';

import { pointEvent } from '../points/events';
import { futureEvent } from './events';
import { prefilledReport } from './prefill';

/**
 * The access of both report actions (ADR 0011): the item under its row lock through the author's write
 * scope, so anyone else's is not-found, then the policy: the author's, once the akce is approved. No
 * version is compared: the list the button sits on has none, and what the action checks (is a report
 * due) is read from the locked row.
 */
const reportAccess = <I extends { readonly id: string }>(): ResourceAccess<
  I,
  FutureItemRecord
> => ({
  kind: 'resource',
  load: (tx, { id }) => tx.futureItems.loadForWrite(id),
  expectedVersion: 'unversioned',
  check: (item): Check => ({
    action: 'future.report',
    item: { authorId: item.authorId, state: item.state, kind: item.kind },
  }),
});

/** Whether a report is owed for the akce on the Prague day of `now`. */
function owed(item: FutureItemRecord, now: Date): boolean {
  const { startDate, endDate, expectsReport } = item.content;
  const lastDay = endDate ?? startDate;
  return (
    lastDay !== null &&
    reportDue(
      { state: item.state, expectsReport, reportState: item.reportState, lastDay },
      instantToWallClock(now).date,
    )
  );
}

/**
 * „Napsat zprávu“ (design section 12): the report of the chosen type, prefilled from the akce. The
 * client ref is the akce's id, so a second press gives the same draft and writes nothing more. A
 * new one counts against the author's draft cap like any other.
 */
export const startFutureReport = defineUseCase({
  name: 'future.startReport',
  mode: 'write',
  input: startFutureReportInput,
  output: startFutureReportOutput,
  access: reportAccess(),
  async execute({ tx, now }, { typeId }, item) {
    if (!owed(item, now)) return fail({ code: 'rule', rule: 'report-not-due' });
    const { existing, drafts } = await tx.points.beginCreate(item.id);
    if (existing) return ok({ pointId: existing.id });

    const type = await tx.pointTypes.get(typeId);
    if (!type?.active) return fail({ code: 'invalid-input', fields: { typeId: 'invalid' } });
    if (drafts >= DRAFT_CAP) return fail({ code: 'rule', rule: 'draft-cap' });

    const { point } = await tx.points.create({
      clientRef: item.id,
      kind: 'report',
      typeId,
      content: prefilledReport(item.content, type.defaultBullets),
      futureItemId: item.id,
    });
    await tx.audit.record(pointEvent('point.created', null, point));
    const after = await tx.futureItems.update(item.id, item.version, { reportPointId: point.id });
    await tx.audit.record(futureEvent('future.report-started', item, after));
    return ok({ pointId: point.id });
  },
});

/** „Zprávu psát nebudu“: the akce is done with, and no report is asked for. */
export const declineFutureReport = defineUseCase({
  name: 'future.declineReport',
  mode: 'write',
  input: declineFutureReportInput,
  output: declineFutureReportOutput,
  access: reportAccess(),
  async execute({ tx, now }, _input, item) {
    if (!owed(item, now)) return fail({ code: 'rule', rule: 'report-not-due' });
    const after = await tx.futureItems.update(item.id, item.version, { reportState: 'declined' });
    await tx.audit.record(futureEvent('future.report-declined', item, after));
    return ok({ version: after.version });
  },
});
