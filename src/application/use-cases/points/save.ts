import { defineUseCase, fail, ok } from '@/application/core';
import type { PointRecord, Tx } from '@/application/ports';
import {
  savePointInput,
  savePointOutput,
  type FieldIssueCode,
  type FieldIssues,
} from '@/contracts';
import type { PointContent, PointKind } from '@/domain/report';
import { authorEditsPoint } from '@/domain/review';
import { parseRichDoc, type RichProfile } from '@/domain/richtext';

import { pointView, pointWriteAccess } from './load-for-write';

/** A report's body is plain paragraphs, as the meeting prints it; proposals may use the outline. */
const BODY_PROFILE: Readonly<Record<PointKind, RichProfile>> = {
  report: 'paragraphs',
  finance: 'outline',
  pokyn: 'outline',
};

/** The content fields whose check failed, each as `invalid`, on the path the contract uses. */
const invalid = (failed: Readonly<Record<string, boolean>>): FieldIssues =>
  Object.fromEntries(
    Object.entries(failed)
      .filter(([, refused]) => refused)
      .map(([field]): [string, FieldIssueCode] => [`content.${field}`, 'invalid']),
  );

/**
 * What the content may hold for the point's kind. A report's bullet with a
 * key of its type's spec carries that spec's kind, because the opening and
 * readiness match a bullet to its spec by key; a missing required bullet is
 * readiness's to report. Finance and pokyn have a title and a text only
 * (design section 11).
 */
async function kindIssues(tx: Tx, point: PointRecord, content: PointContent): Promise<FieldIssues> {
  const body = !parseRichDoc(content.body, BODY_PROFILE[point.kind]).ok;
  if (point.kind !== 'report') {
    return invalid({
      body,
      bullets: content.bullets.length > 0,
      statements: content.statements.length > 0,
    });
  }
  const type = point.typeId === null ? null : await tx.pointTypes.get(point.typeId);
  const kinds = new Map(type?.defaultBullets.map((spec) => [spec.key, spec.kind]));
  return invalid({
    body,
    bullets: content.bullets.some((b) => (kinds.get(b.key) ?? b.kind) !== b.kind),
  });
}

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
    const fields = await kindIssues(tx, point, content);
    if (Object.keys(fields).length > 0) return fail({ code: 'invalid-input', fields });

    const saved = await tx.points.update(point.id, point.version, { content });
    tx.audit.exempt('author-autosave', { type: 'point', id: point.id });
    return ok({ version: saved.version });
  },
});
