import { defineUseCase, fail, ok } from '@/application/core';
import type { AuditTarget, PointPatch, PointRecord, Tx } from '@/application/ports';
import { submitPointInput, submitPointOutput } from '@/contracts';
import { schoolYear } from '@/domain/cs';
import { missingForSubmit, submittedContent } from '@/domain/report';
import { instantToWallClock } from '@/domain/time';

import { ensureIssue, readWindow } from '../issues';
import { move, moveCheck } from './append-event';
import { kindIssues, readinessIssues, typeSpec } from './checks';
import { pointWriteAccess } from './load-for-write';

interface FirstSubmit {
  readonly patch: Pick<PointPatch, 'earliestMonday'>;
  readonly related?: readonly AuditTarget[];
}

/**
 * The Monday a point is first handed in for, set once (`points_earliest_fixed`):
 * the first one whose deadline is still ahead, skips ignored, since placement
 * moves a point past a skipped Monday on read (design section 3). Its issue
 * is made here if it has no row yet, and is then named in the audit event.
 * A resubmit after a return or a retract keeps the first Monday.
 */
async function firstSubmit(tx: Tx, point: PointRecord, now: Date): Promise<FirstSubmit> {
  if (point.earliestMonday !== null) return { patch: {} };
  const { first } = await readWindow(tx, now);
  const { issue, inserted } = await ensureIssue(tx, first);
  return {
    patch: { earliestMonday: first },
    ...(inserted && { related: [{ type: 'issue', id: issue.id }] }),
  };
}

/**
 * „Odeslat ke kontrole“ (design sections 8 and 9): the content the editor
 * holds is checked as a save checks it, then for readiness, and stored
 * without the empty optional bullets as the point moves to submitted. A
 * refusal writes nothing; readiness warnings never refuse.
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

    const { patch, related } = await firstSubmit(tx, point, now);
    const after = await move(
      tx,
      point,
      'submit',
      { ...patch, content: submittedContent(content, spec), submittedAt: now },
      related,
    );
    return ok({ version: after.version });
  },
});
