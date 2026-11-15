import { defineUseCase, fail, ok } from '@/application/core';
import { savePointInput, savePointOutput } from '@/contracts';
import { authorEditsPoint } from '@/domain/review';

import { pointView, pointWriteAccess } from './access';
import { kindIssues, reportSpec } from './checks';

/**
 * The author's autosave (design section 8, ADR 0017): the whole content
 * against the version the editor holds, unaudited under `author-autosave`.
 * The pipeline compares the version before anything else is looked at, so a
 * stale editor gets `conflict` whatever the point's state.
 */
export const savePoint = defineUseCase({
  name: 'points.save',
  mode: 'write',
  input: savePointInput,
  output: savePointOutput,
  access: pointWriteAccess((point) => ({ action: 'point.view', point: pointView(point) })),
  async execute({ tx, actor }, { content }, point) {
    if (point.authorId !== actor.id) return fail({ code: 'forbidden' });
    // Narrower than `point.edit`: a reviewer or the headmaster changes a point
    // in review, their own included, only through the audited review edit.
    // The scoped load already gave a pending or inactive account not-found.
    if (!authorEditsPoint(point.state)) return fail({ code: 'rule', rule: 'point-not-editable' });
    const fields = kindIssues(point.kind, content, reportSpec(point.kind));
    if (Object.keys(fields).length > 0) return fail({ code: 'invalid-input', fields });

    const saved = await tx.points.update(point.id, point.version, { content });
    tx.audit.exempt('author-autosave', { type: 'point', id: point.id });
    return ok({ version: saved.version });
  },
});
