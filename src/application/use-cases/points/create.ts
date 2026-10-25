import { defineUseCase, fail, ok, type Outcome } from '@/application/core';
import type { Tx } from '@/application/ports';
import { createPointInput, createPointOutput } from '@/contracts';
import { DRAFT_CAP, newDraft, type BulletSpec, type PointKind } from '@/domain/report';

import { pointEvent } from './events';

/**
 * The bullets a new point starts with: a report's from its type, which must be
 * on offer; finance and pokyn name no type and have none.
 */
async function startingBullets(
  tx: Tx,
  kind: PointKind,
  typeId: string | null,
): Promise<Outcome<readonly BulletSpec[]>> {
  if (kind !== 'report') {
    return typeId === null
      ? ok([])
      : fail({ code: 'invalid-input', fields: { typeId: 'invalid' } });
  }
  if (typeId === null) return fail({ code: 'invalid-input', fields: { typeId: 'required' } });
  const type = await tx.pointTypes.get(typeId);
  if (!type?.active) return fail({ code: 'invalid-input', fields: { typeId: 'invalid' } });
  return ok(type.defaultBullets);
}

/**
 * Starts an empty draft (design section 6). A retry with a ref the author
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
  access: { kind: 'gate', check: () => ({ action: 'point.create' }) },
  async execute({ tx }, { clientRef, kind, typeId }) {
    const { existing, drafts } = await tx.points.beginCreate(clientRef);
    if (existing) return ok({ id: existing.id });

    const bullets = await startingBullets(tx, kind, typeId);
    if (!bullets.ok) return bullets;
    if (drafts >= DRAFT_CAP) return fail({ code: 'rule', rule: 'draft-cap' });

    const content = newDraft(bullets.value);
    const { point, inserted } = await tx.points.create({ clientRef, kind, typeId, content });
    if (inserted) await tx.audit.record(pointEvent('point.created', null, point));
    return ok({ id: point.id });
  },
});
