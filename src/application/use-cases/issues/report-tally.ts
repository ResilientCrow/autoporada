import { defineUseCase, ok, readReportsSince } from '@/application/core';
import { reportTallyInput, reportTallyOutput } from '@/contracts';
import type { PointState } from '@/domain/review';
import { compareDates, instantToWallClock, toIsoDate } from '@/domain/time';

import { owedAkce } from './assemble-missing';
import { readWindow } from './calendar';

/** A report point in one of these states is not handed in: the author still has it, or dropped it. */
const NOT_HANDED_IN: ReadonlySet<PointState> = new Set(['draft', 'returned', 'withdrawn']);

/**
 * „Zprávy z akcí pro poradu …: neodevzdáno n z m“ on Přehled (ADR 0052): for the working porada (the
 * first open one whose meeting day is today or later), how many akce it owes (`owedTo`, ADR 0049,
 * ended or not) and how many of them have no report handed in: none started, or one that is a
 * draft, returned or withdrawn. Counts only. Null when no such porada is open or it owes nothing.
 */
export const reportTally = defineUseCase({
  name: 'issues.reportTally',
  mode: 'read',
  input: reportTallyInput,
  output: reportTallyOutput,
  access: { kind: 'gate', check: () => ({ action: 'issue.edit' }) },
  async execute({ tx, now }) {
    const today = instantToWallClock(now).date;
    const { slots } = await readWindow(tx, now);
    const slot = slots.find((s) => s.status === 'open' && compareDates(s.meetingDate, today) >= 0);
    if (!slot) return ok({ porada: null });
    const owed = await owedAkce(tx, await readReportsSince(tx, slot.monday), slot.meetingDate);
    if (owed.length === 0) return ok({ porada: null });
    const bound = owed.flatMap((akce) => akce.reportPointId ?? []);
    const states = new Map((await tx.points.statesOf(bound)).map((s) => [s.id, s.state]));
    const missing = owed.filter((akce) => {
      const state = akce.reportPointId === null ? undefined : states.get(akce.reportPointId);
      return state === undefined || NOT_HANDED_IN.has(state);
    }).length;
    return ok({
      porada: {
        monday: toIsoDate(slot.monday),
        meetingDate: toIsoDate(slot.meetingDate),
        owed: owed.length,
        missing,
      },
    });
  },
});
