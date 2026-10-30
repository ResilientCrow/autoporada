import { defineUseCase, ok } from '@/application/core';
import { createFutureInput, createFutureOutput } from '@/contracts';

import { futureEvent } from './events';

/**
 * Starts an empty jednání or akce (design section 12). A retry with a ref the
 * author already used answers with that item as it is, whatever else it
 * names, and writes nothing: the create is audited once.
 */
export const createFuture = defineUseCase({
  name: 'future.create',
  mode: 'write',
  input: createFutureInput,
  output: createFutureOutput,
  access: { kind: 'gate', check: () => ({ action: 'future.create' }) },
  async execute({ tx }, { clientRef, kind }) {
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
        responsible: null,
        expectsReport: false,
      },
    });
    if (inserted) await tx.audit.record(futureEvent('future.created', null, item));
    return ok({ id: item.id });
  },
});
