import { defineUseCase, fail, ok } from '@/application/core';
import type { AuditTarget, PointPatch, PointRecord, Tx } from '@/application/ports';
import { submitPointInput, submitPointOutput } from '@/contracts';
import { handInMonday, lateFacts } from '@/domain/calendar';
import { schoolYear } from '@/domain/cs';
import { missingForSubmit, submittedContent, type PointContent } from '@/domain/report';
import { instantToWallClock } from '@/domain/time';

import { ensureIssue, readWindow } from '../issues';
import { pointWriteAccess } from './access';
import { akceTarget, answeredAkce, writeReport } from './answered-akce';
import { move, moveCheck } from './append-event';
import { kindIssues, readinessIssues, typeSpec } from './checks';

interface HandIn {
  readonly patch: Pick<PointPatch, 'earliestMonday' | 'handInMonday'>;
  readonly related?: readonly AuditTarget[];
}

/**
 * The Monday this hand-in is for: the first open slot whose close is still ahead, skipped and
 * generated slots stepped over, so a later unskip does not pull the point back to a Monday it
 * never was handed in for (ADR 0029). A report about an event that ends before a meeting day has
 * the later close of ADR 0035, so a Sunday-evening report still reaches Monday's porada. It is
 * stored as `hand_in_monday` at every submit, so a resubmit after a return or a retract is placed
 * by its new Monday. The first submit also sets `earliest_monday` once (`points_earliest_fixed`),
 * which a resubmit keeps, and makes the Monday's issue if it has no row yet, then named in the
 * audit event.
 */
async function handIn(
  tx: Tx,
  point: PointRecord,
  content: PointContent,
  now: Date,
): Promise<HandIn> {
  const { slots, rule } = await readWindow(tx, now);
  const report = point.kind === 'report' ? lateFacts(content) : undefined;
  const first = handInMonday(now, slots, rule, report);
  if (point.earliestMonday !== null) return { patch: { handInMonday: first } };
  const { issue, inserted } = await ensureIssue(tx, first, rule);
  return {
    patch: { earliestMonday: first, handInMonday: first },
    ...(inserted && { related: [{ type: 'issue', id: issue.id }] }),
  };
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
    const { patch, related = [] } = await handIn(tx, point, content, now);
    const named = akce ? [...related, akceTarget(akce)] : related;
    const { after } = await move(tx, point, 'submit', {
      patch: { ...patch, content: submittedContent(content, spec), submittedAt: now },
      ...(named.length > 0 && { related: named }),
    });
    if (akce) await writeReport(tx, akce);
    return ok({ version: after.version });
  },
});
