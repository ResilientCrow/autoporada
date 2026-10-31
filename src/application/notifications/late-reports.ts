import { readSlots } from '@/application/core';
import type { EndingAkce, Tx } from '@/application/ports';
import {
  eventEnd,
  handInSlot,
  isLateReport,
  lateMailDue,
  reportCloses,
  type IssueRow,
  type IssueSlot,
  type LateFacts,
} from '@/domain/calendar';
import { addDays, instantToWallClock, toIsoDate, type CalDate } from '@/domain/time';

/** What the caller knows when it enqueues the mail at an akce's end: the author and the akce. */
export interface ReportEndedIds {
  readonly authorId: string;
  readonly itemId: string;
}

/** One mail per akce (ADR 0035); the subject is the akce, whose dates are read again at send time. */
export const reportEndedParts = ({ authorId, itemId }: ReportEndedIds) => ({
  recipientId: authorId,
  subjectId: itemId,
  key: itemId,
});

/** The mail an hour before the close: to the akce's author while no report is started, else to the author of the draft. */
export interface LastCallIds {
  readonly authorId: string;
  readonly kind: 'akce' | 'point';
  readonly id: string;
  /** The Monday of the slot the report is late for. */
  readonly monday: CalDate;
}

/** One mail per report and slot; the subject names the report and which table it is in. */
export const lastCallParts = ({ authorId, kind, id, monday }: LastCallIds) => ({
  recipientId: authorId,
  subjectId: `${kind}:${id}`,
  key: `${kind}:${id}:${toIsoDate(monday)}`,
});

/** The ledger key of `report.ended` (`${template}:${key}`), for the prompt that yields to it. */
const reportEndedKey = (itemId: string) => `report.ended:${itemId}`;

/** A late report's slot: where a hand-in now would go, and when the report closes for it. */
interface LateClose {
  readonly slot: IssueRow;
  readonly due: Date;
}

/** The slot a report about this event goes to now and its close, or null when the report is not late for it. */
function lateClose(
  slots: readonly IssueSlot[],
  rule: Parameters<typeof handInSlot>[2],
  now: Date,
  facts: LateFacts,
): LateClose | null {
  const slot = handInSlot(now, slots, rule, facts);
  return isLateReport(slot, facts) ? { slot: slot, due: reportCloses(slot, facts) } : null;
}

type Reads = Pick<Tx, 'ctx' | 'futureItems' | 'issues' | 'settings'>;

/** An akce that has just ended and whose report is late, with the close of that report. */
export interface EndedAkce {
  readonly item: EndingAkce;
  readonly close: LateClose;
}

/** The akce whose `report.ended` mail is due now: ended, late for their slot and not yet written. */
export async function endedAkce(tx: Reads, now: Date): Promise<readonly EndedAkce[]> {
  const today = instantToWallClock(now).date;
  const [items, { slots, rule }] = await Promise.all([
    tx.futureItems.reportsEnding({ from: addDays(today, -1), to: today }),
    readSlots(tx, now),
  ]);
  return items.flatMap((item) => {
    const close = lateClose(slots, rule, now, item);
    return close && lateMailDue('ended', eventEnd(item), close.due, now) ? [{ item, close }] : [];
  });
}

/** Whether the mail at the akce's end went out, so the 08.00 prompt need not ask again. */
export async function endedMailSent(tx: Pick<Tx, 'mailLedger'>, item: { id: string }) {
  return (await tx.mailLedger.get(reportEndedKey(item.id))) !== null;
}

/** What the mail at an akce's end is about at send time. */
export interface ReportEndedFacts {
  readonly authorId: string;
  readonly state: EndingAkce['state'];
  readonly expectsReport: boolean;
  readonly reportState: EndingAkce['reportState'];
  readonly meetingDate: CalDate;
  readonly due: Date;
}

/** Read again when the mail goes: null when the akce is gone, no longer late, or its close has passed. */
export async function loadReportEnded(tx: Reads, itemId: string): Promise<ReportEndedFacts | null> {
  const { now } = tx.ctx;
  const item = await tx.futureItems.reportEnding(itemId);
  if (!item) return null;
  const { slots, rule } = await readSlots(tx, now);
  const close = lateClose(slots, rule, now, item);
  if (!close) return null;
  const { authorId, state, expectsReport, reportState } = item;
  return {
    authorId,
    state,
    expectsReport,
    reportState,
    meetingDate: close.slot.meetingDate,
    due: close.due,
  };
}

/** The reports whose last call is due now: akce still without a report, and late drafts and returned reports. */
export async function lastCalls(
  tx: Pick<Tx, 'futureItems' | 'points' | 'issues' | 'settings'>,
  now: Date,
): Promise<readonly LastCallIds[]> {
  const today = instantToWallClock(now).date;
  const window = { from: addDays(today, -1), to: today };
  const [akce, reports, { slots, rule }] = await Promise.all([
    tx.futureItems.reportsEnding(window),
    tx.points.reportPoints(window),
    readSlots(tx, now),
  ]);
  const candidates = [
    ...akce.map((item) => ({ kind: 'akce' as const, ...item })),
    ...reports
      .filter((point) => point.state === 'draft' || point.state === 'returned')
      .map((point) => ({ kind: 'point' as const, ...point })),
  ];
  return candidates.flatMap(({ kind, id, authorId, ...facts }) => {
    const close = lateClose(slots, rule, now, facts);
    return close && lateMailDue('last-call', eventEnd(facts), close.due, now)
      ? [{ authorId, kind, id, monday: close.slot.monday }]
      : [];
  });
}

/** What the last call is about at send time. */
export interface LastCallFacts {
  readonly authorId: string;
  /** The report is still to be handed in: the akce has none, or the draft is a draft or returned. */
  readonly open: boolean;
  readonly meetingDate: CalDate;
  readonly due: Date;
}

/** Read again when the mail goes: null when the report is gone or not late for its slot any more. */
export async function loadLastCall(tx: Reads & Pick<Tx, 'points'>, subjectId: string) {
  const { now } = tx.ctx;
  const [kind, id = ''] = subjectId.split(':');
  const found =
    kind === 'akce'
      ? await tx.futureItems.reportEnding(id).then((item) => {
          const open =
            item?.state === 'approved' &&
            item.expectsReport &&
            (item.reportState === 'none' || item.reportState === 'prompted');
          return item && { item, open };
        })
      : kind === 'point'
        ? await tx.points.reportPoint(id).then((item) => {
            return item && { item, open: item.state === 'draft' || item.state === 'returned' };
          })
        : null;
  if (!found) return null;
  const { slots, rule } = await readSlots(tx, now);
  const close = lateClose(slots, rule, now, found.item);
  if (!close) return null;
  const facts: LastCallFacts = {
    authorId: found.item.authorId,
    open: found.open,
    meetingDate: close.slot.meetingDate,
    due: close.due,
  };
  return facts;
}
