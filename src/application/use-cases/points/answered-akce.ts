import type { AuditTarget, FutureItemRecord, PointRecord, Tx } from '@/application/ports';
import { REPORT_MACHINE, transition } from '@/domain/review';

import { futureEvent } from '../future/events';

/**
 * The akce this report answers, if it is the report that akce started (design section 12): the item
 * under its row lock through the author's write scope, so an akce of someone else is never found, and
 * only when its `report_point_id` names this point and its author is the point's.
 */
export async function answeredAkce(tx: Tx, point: PointRecord): Promise<FutureItemRecord | null> {
  if (point.futureItemId === null) return null;
  const item = await tx.futureItems.loadForWrite(point.futureItemId);
  return item && item.authorId === point.authorId && item.reportPointId === point.id ? item : null;
}

/** What the point's audit event names besides the point: the akce, whose report is now handed in. */
export const akceTarget = (item: FutureItemRecord): AuditTarget => ({
  type: 'future_item',
  id: item.id,
});

/**
 * Hands the akce's report in: `report_state = 'written'`, audited by its states only. An akce
 * whose report is already written or declined stays as it is (a resubmit after a return), and so does
 * one that no longer expects a report (revised since the report was started): the CHECK
 * `future_items_report_needs_expect` would refuse the move, and the submit must not.
 */
export async function writeReport(tx: Tx, item: FutureItemRecord): Promise<void> {
  if (!item.content.expectsReport) return;
  const moved = transition(REPORT_MACHINE, item.reportState, 'write', {
    kind: 'user',
    role: 'submitter',
    isAuthor: true,
  });
  if (!moved.ok) return;
  const after = await tx.futureItems.update(item.id, item.version, { reportState: moved.to });
  await tx.audit.record(futureEvent('future.report-written', item, after));
}
