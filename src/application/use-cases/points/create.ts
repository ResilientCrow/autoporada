import { defineUseCase, fail, ok } from '@/application/core';
import { createPointInput, createPointOutput } from '@/contracts';
import { DRAFT_CAP, newDraft, REPORT_BULLETS } from '@/domain/report';

import { pointEvent } from './events';

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
  async execute({ tx }, { clientRef, kind }) {
    const { existing, drafts } = await tx.points.beginCreate(clientRef);
    if (existing) return ok({ id: existing.id });

    if (drafts >= DRAFT_CAP) return fail({ code: 'rule', rule: 'draft-cap' });

    const content = newDraft(kind === 'report' ? REPORT_BULLETS : []);
    const { point, inserted } = await tx.points.create({ clientRef, kind, content });
    if (inserted) await tx.audit.record(pointEvent('point.created', null, point));
    return ok({ id: point.id });
  },
});
