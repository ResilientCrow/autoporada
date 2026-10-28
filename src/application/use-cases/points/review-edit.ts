import { defineUseCase, fail, ok } from '@/application/core';
import { reviewEditPointInput, reviewEditPointOutput } from '@/contracts';
import { schoolYear } from '@/domain/cs';
import { can } from '@/domain/policy';
import {
  diffPointFields,
  missingForSubmit,
  pointFieldValues,
  submittedContent,
} from '@/domain/report';
import { instantToWallClock } from '@/domain/time';

import { pointView, pointWriteAccess } from './access';
import { kindIssues, readinessIssues, typeSpec } from './checks';

/**
 * „Uložit úpravy“ of a reviewer on /kontrola/[id] (design section 10, D13 (a)): the whole content
 * against the version the page showed. A stale page is a conflict before anything else. The author
 * never edits here, their own draft included: they change their point through the autosave, or
 * retract it first (SSU-6). Anyone else needs `point.edit` on the locked row: a reviewer edits what
 * waits for review, and an approved point only someone who could have approved it. The point stays
 * handed in, so the content passes the submit's checks (the save's, then readiness) and is stored
 * as the submit stores it, without its empty optional bullets. An edit that changes no field once
 * stored writes nothing and keeps the version (`changed: false`); otherwise one versioned update,
 * an `edit` event with the names of the changed fields and their previous values, and an audit
 * event naming the fields, never the values. No mail goes out.
 */
export const reviewEditPoint = defineUseCase({
  name: 'points.reviewEdit',
  mode: 'write',
  input: reviewEditPointInput,
  output: reviewEditPointOutput,
  access: pointWriteAccess((point) => ({ action: 'point.view', point: pointView(point) })),
  async execute({ tx, actor, now }, { content }, point) {
    if (point.authorId === actor.id) return fail({ code: 'rule', rule: 'point-not-editable' });
    const target = { authorId: point.authorId, state: point.state };
    if (!can(actor, { action: 'point.edit', point: target })) return fail({ code: 'forbidden' });
    const spec = await typeSpec(tx, point);
    const shape = kindIssues(point.kind, content, spec);
    if (Object.keys(shape).length > 0) return fail({ code: 'invalid-input', fields: shape });
    // Today's school year, as the submit's: a point handed in before the summer and edited in
    // September goes to a September porada, so its classes must be this year's.
    const year = schoolYear(instantToWallClock(now).date);
    const { problems } = missingForSubmit(point.kind, content, spec, year);
    if (problems.length > 0) {
      return fail({ code: 'invalid-input', fields: readinessIssues(problems) });
    }

    const stored = submittedContent(content, spec);
    const edited = diffPointFields(point.content, stored);
    if (edited.length === 0) return ok({ version: point.version, changed: false });
    const after = await tx.points.update(point.id, point.version, { content: stored });
    await tx.pointEvents.append({
      pointId: point.id,
      event: 'edit',
      fromState: point.state,
      toState: point.state,
      editedFields: edited,
      before: pointFieldValues(point.content, edited),
    });
    await tx.audit.record({
      action: 'point.edited',
      target: { type: 'point', id: point.id },
      meta: { fields: edited },
    });
    return ok({ version: after.version, changed: true });
  },
});
