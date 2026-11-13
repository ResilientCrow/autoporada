import { defineUseCase, fail, ok, type Outcome } from '@/application/core';
import { createPointInput, createPointOutput } from '@/contracts';
import {
  DRAFT_CAP,
  newDraft,
  pointType,
  type BulletSpec,
  type PointKind,
  type PointTypeId,
} from '@/domain/report';

import { pointEvent } from './events';

/** The bullets a new point starts with: a report's from its type; finance and pokyn name no type and have none. */
function startingBullets(
  kind: PointKind,
  typeId: PointTypeId | null,
): Outcome<readonly BulletSpec[]> {
  if (kind !== 'report') {
    return typeId === null
      ? ok([])
      : fail({ code: 'invalid-input', fields: { typeId: 'invalid' } });
  }
  if (typeId === null) return fail({ code: 'invalid-input', fields: { typeId: 'required' } });
  return ok(pointType(typeId).defaultBullets);
}

/**
 * Starts an empty draft (design section 6). Any submitter may start a report; a finance or
 * pokyn proposal is the vedení's (ADR 0052). A retry with a ref the author
 * already used answers with that point as it is, whatever else it names and
 * even at the cap, and writes nothing: the create is audited once. An author
 * holds at most DRAFT_CAP drafts; `beginCreate` serialises their creates, so
 * two at once cannot both take the last place.
 */
export const createPoint = defineUseCase({
  name: 'points.create',
  mode: 'write',
  input: createPointInput,
  output: createPointOutput,
  access: {
    kind: 'gate',
    check: ({ kind }) => ({ action: kind === 'report' ? 'point.create' : 'point.propose' }),
  },
  async execute({ tx }, { clientRef, kind, typeId }) {
    const { existing, drafts } = await tx.points.beginCreate(clientRef);
    if (existing) return ok({ id: existing.id });

    const bullets = startingBullets(kind, typeId);
    if (!bullets.ok) return bullets;
    if (drafts >= DRAFT_CAP) return fail({ code: 'rule', rule: 'draft-cap' });

    const content = newDraft(bullets.value);
    const { point, inserted } = await tx.points.create({ clientRef, kind, typeId, content });
    if (inserted) await tx.audit.record(pointEvent('point.created', null, point));
    return ok({ id: point.id });
  },
});
