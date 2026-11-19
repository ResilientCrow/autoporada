import { defineUseCase, fail, ok } from '@/application/core';
import { createFutureInput, createFutureOutput } from '@/contracts';
import { FUTURE_CAP } from '@/domain/report';

import { futureEvent } from './events';

/**
 * Starts an empty jednání or akce (design section 12). A retry with a ref the
 * author already used answers with that item as it is, whatever else it
 * names, even at the cap, and writes nothing: the create is audited once. An
 * author holds at most FUTURE_CAP drafts; `beginCreate` serialises their
 * creates, so two at once cannot both take the last place.
 */
export const createFuture = defineUseCase({
  name: 'future.create',
  mode: 'write',
  input: createFutureInput,
  output: createFutureOutput,
  access: { kind: 'gate', check: () => ({ action: 'future.create' }) },
  async execute({ tx }, { clientRef, kind }) {
    const { existing, drafts } = await tx.futureItems.beginCreate(clientRef);
    if (existing) return ok({ id: existing.id });

    if (drafts >= FUTURE_CAP) return fail({ code: 'rule', rule: 'future-draft-cap' });

    const { item, inserted } = await tx.futureItems.create({
      clientRef,
      kind,
      content: {
        title: '',
        startDate: null,
        endDate: null,
        timeFrom: null,
        timeTo: null,
        campus: null,
        place: null,
        organizer: null,
        organizerRole: null,
        participants: null,
        participantsAddress: null,
        note: null,
      },
    });
    if (inserted) await tx.audit.record(futureEvent('future.created', null, item));
    return ok({ id: item.id });
  },
});
