import { defineUseCase, ok, readReportsSince } from '@/application/core';
import type { FutureItemRecord, Tx } from '@/application/ports';
import { owedReportsInput, owedReportsOutput, futureContentToView } from '@/contracts';
import { eventEnd, lateFacts, reportCloses, type IssueSlot } from '@/domain/calendar';
import { REPORT_MACHINE } from '@/domain/review';
import { compareDates, instantToWallClock, toIsoDate } from '@/domain/time';

import { owedAkce } from '../issues/assemble-missing';
import { readWindow } from '../issues/calendar';

/** An akce of the author's owed to an open porada, with the slot and its report's close. */
interface Owed {
  readonly akce: FutureItemRecord;
  readonly slot: IssueSlot;
  readonly closesAt: Date;
}

/**
 * The author's ended, approved akce each open porada owes (ADR 0049 `owedTo`), slot by slot in
 * Monday order. A porada whose `since` is after today owes only akce that have not ended, so the
 * walk stops there.
 */
async function ownOwed(tx: Tx, authorId: string, now: Date): Promise<Owed[]> {
  const today = instantToWallClock(now).date;
  const { slots, plannedThrough } = await readWindow(tx, now);
  const found: Owed[] = [];
  for (const slot of slots) {
    if (slot.status !== 'open') continue;
    const since = await readReportsSince(tx, slot.monday, plannedThrough);
    if (compareDates(since, today) > 0) break;
    for (const akce of await owedAkce(tx, since, slot.meetingDate)) {
      const c = akce.content;
      const facts = lateFacts({ eventDate: c.startDate, endDate: c.endDate, timeTo: c.timeTo });
      if (akce.authorId !== authorId || akce.state !== 'approved' || facts === undefined) continue;
      if (eventEnd(facts).getTime() > now.getTime()) continue;
      found.push({ akce, slot, closesAt: reportCloses(slot, facts) });
    }
  }
  return found;
}

/**
 * „Akce čekající na zprávu“ (ADR 0052): the author's approved akce that have ended and whose porada
 * is open, so that porada still prints their report. A row stays while its report is a draft or
 * returned (to go on with), and while none is started or the one started was withdrawn and a new
 * one may be (`REPORT_MACHINE.write`). It leaves once the report is handed in. By porada, then by
 * close. The open porady bound it, not a page of the list.
 */
export const owedReports = defineUseCase({
  name: 'future.owedReports',
  mode: 'read',
  input: owedReportsInput,
  output: owedReportsOutput,
  access: { kind: 'gate', check: () => ({ action: 'future.create' }) },
  async execute({ tx, actor, now }) {
    const owed = await ownOwed(tx, actor.id, now);
    // The author's own report points, a few at most: read in the author's scope, one by one.
    const bound = owed.flatMap(({ akce }) => akce.reportPointId ?? []);
    const read = await Promise.all(bound.map((id) => tx.points.get(id)));
    const states = new Map(read.flatMap((p) => (p ? [[p.id, p.state] as const] : [])));
    const items = owed.flatMap(({ akce, slot, closesAt }) => {
      const id = akce.reportPointId;
      const state = id === null ? undefined : states.get(id);
      const report =
        id !== null && (state === 'draft' || state === 'returned') ? { id, state } : null;
      const fresh =
        (state === undefined || state === 'withdrawn') &&
        REPORT_MACHINE.write.from.includes(akce.reportState);
      if (report === null && !fresh) return [];
      const { title, startDate, endDate, timeFrom, timeTo } = futureContentToView(akce.content);
      return [
        {
          sort: [toIsoDate(slot.monday), closesAt.getTime()] as const,
          item: {
            id: akce.id,
            title,
            startDate,
            endDate,
            timeFrom,
            timeTo,
            monday: toIsoDate(slot.monday),
            meetingDate: toIsoDate(slot.meetingDate),
            closesAt: closesAt.toISOString(),
            report,
          },
        },
      ];
    });
    // Stable: within a porada and a close, the order of `owedTo` (by the akce's start).
    items.sort((a, b) => a.sort[0].localeCompare(b.sort[0]) || a.sort[1] - b.sort[1]);
    return ok({ items: items.map(({ item }) => item) });
  },
});
