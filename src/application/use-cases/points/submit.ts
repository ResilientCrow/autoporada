import { defineUseCase, fail, ok, type CalendarWindow } from '@/application/core';
import type {
  AuditTarget,
  FutureItemRecord,
  PointPatch,
  PointRecord,
  Tx,
} from '@/application/ports';
import { submitPointInput, submitPointOutput } from '@/contracts';
import {
  handInMonday,
  lateFacts,
  owedPorada,
  REPORT_LOOKBACK_WEEKS,
  type DeadlineRule,
  type IssueSlot,
} from '@/domain/calendar';
import { schoolYear } from '@/domain/cs';
import { missingForSubmit, submittedContent, type PointContent } from '@/domain/report';
import { addDays, instantToWallClock, isSameDate, type CalDate } from '@/domain/time';

import { ensureIssue, readWindow } from '../issues';
import { pointWriteAccess } from './access';
import { akceTarget, answeredAkce, writeReport } from './answered-akce';
import { move, moveCheck } from './append-event';
import { kindIssues, readinessIssues, typeSpec } from './checks';

interface HandIn {
  readonly patch: Pick<PointPatch, 'earliestMonday' | 'handInMonday'>;
  readonly related?: readonly AuditTarget[];
}

/** The hand-in a point gets: its Mondays, and the issue made for them if it had no row. */
function handInOf(point: PointRecord, monday: CalDate, made: { id: string } | null): HandIn {
  return {
    patch:
      point.earliestMonday !== null
        ? { handInMonday: monday }
        : { earliestMonday: monday, handInMonday: monday },
    ...(made && { related: [{ type: 'issue' as const, id: made.id }] }),
  };
}

/** The hand-in for `monday`; the first submit makes the Monday's issue if it has no row yet. */
async function placeAt(
  tx: Tx,
  point: PointRecord,
  monday: CalDate,
  window: CalendarWindow,
): Promise<HandIn | null> {
  if (point.earliestMonday !== null) return handInOf(point, monday, null);
  const ensured = await ensureIssue(tx, monday, window);
  if (!ensured) return null;
  return handInOf(point, monday, ensured.inserted ? ensured.issue : null);
}

/**
 * The porada a report of an approved akce is for (ADR 0049): the akce decides it by its last day,
 * not the day the report is handed in, so a report that is late still reaches the porada the akce
 * is owed to while that one is open. Null when that porada is not open (generated), or was
 * never held (a past Monday with no row): nothing is printed for the akce any more. Undefined when the akce does not decide (not approved, no date).
 */
async function owedHandIn(
  tx: Tx,
  point: PointRecord,
  akce: FutureItemRecord,
  window: {
    readonly slots: readonly IssueSlot[];
    readonly rule: DeadlineRule;
    readonly plannedThrough: CalDate;
  },
): Promise<HandIn | null | undefined> {
  const { startDate, endDate } = akce.content;
  const lastDay = endDate ?? startDate;
  if (akce.state !== 'approved' || lastDay === null) return undefined;
  // As far back as `owedPorada` and `reportsSince` look, a porada moved weeks past its Monday included.
  const rows = await tx.issues.calendarBetween(
    addDays(lastDay, -7 * (REPORT_LOOKBACK_WEEKS + 1)),
    addDays(lastDay, 7 * REPORT_LOOKBACK_WEEKS),
  );
  const monday = owedPorada(lastDay, rows, window.plannedThrough);
  // Only a porada the calendar names and holds open takes it: a generated one prints nothing more,
  // and a past Monday with no row was never held, so no issue is made for it.
  const slot = window.slots.find((s) => isSameDate(s.monday, monday));
  if (!slot || slot.status !== 'open') return null;
  return placeAt(tx, point, monday, window);
}

/**
 * The Monday this hand-in is for: the first open slot whose close is still ahead, generated
 * slots stepped over (ADR 0029). A report about an event that ends before a meeting day has
 * the later close of ADR 0035, so a Sunday-evening report still reaches Monday's porada. A report
 * that answers an approved akce goes to the porada the akce is owed to instead (`owedHandIn`).
 * It is stored as `hand_in_monday` at every submit, so a resubmit after a return or a retract is
 * placed by its new Monday. The first submit also sets `earliest_monday` once
 * (`points_earliest_fixed`), which a resubmit keeps, and makes the Monday's issue if it has no row
 * yet, then named in the audit event. Null when the akce's porada is generated.
 */
async function handIn(
  tx: Tx,
  point: PointRecord,
  content: PointContent,
  akce: FutureItemRecord | null,
  now: Date,
): Promise<HandIn | null> {
  const { slots, rule, plannedThrough } = await readWindow(tx, now);
  const owed = akce
    ? await owedHandIn(tx, point, akce, { slots, rule, plannedThrough })
    : undefined;
  if (owed !== undefined) return owed;
  const report = point.kind === 'report' ? lateFacts(content) : undefined;
  const first = handInMonday(now, slots, rule, report, plannedThrough);
  return placeAt(tx, point, first, { rule, plannedThrough });
}

/**
 * „Odeslat ke kontrole“ (design sections 8 and 9): the content the editor
 * holds is checked as a save checks it, then for readiness, and stored
 * without the empty optional bullets as the point moves to submitted. A
 * refusal writes nothing; readiness warnings never refuse. A report that
 * answers an akce marks the akce's report as written (design section 12).
 */
export const submitPoint = defineUseCase({
  name: 'points.submit',
  mode: 'write',
  input: submitPointInput,
  output: submitPointOutput,
  access: pointWriteAccess(moveCheck('submit')),
  async execute({ tx, now }, { content }, point) {
    const spec = await typeSpec(tx, point);
    const shape = kindIssues(point.kind, content, spec);
    if (Object.keys(shape).length > 0) return fail({ code: 'invalid-input', fields: shape });
    const year = schoolYear(instantToWallClock(now).date);
    const { problems } = missingForSubmit(point.kind, content, spec, year);
    if (problems.length > 0) {
      return fail({ code: 'invalid-input', fields: readinessIssues(problems) });
    }

    const akce = await answeredAkce(tx, point);
    const placed = await handIn(tx, point, content, akce, now);
    if (placed === null) return fail({ code: 'rule', rule: 'report-not-due' });
    const { patch, related = [] } = placed;
    const named = akce ? [...related, akceTarget(akce)] : related;
    const { after } = await move(tx, point, 'submit', {
      patch: { ...patch, content: submittedContent(content, spec), submittedAt: now },
      ...(named.length > 0 && { related: named }),
    });
    if (akce) await writeReport(tx, akce);
    return ok({ version: after.version });
  },
});
