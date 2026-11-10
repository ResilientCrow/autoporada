import { defineUseCase, fail, ok } from '@/application/core';
import { deletePointTypeInput, deletePointTypeOutput } from '@/contracts';

import { pointTypeDeletedEvent } from './events';

/**
 * The headmaster deletes a point type (ADR 0054). „Jiné“ (locked) always stays (rule
 * `type-locked`). A type that any point uses, in any state, stays too: the database's foreign key
 * refuses it (rule `type-in-use`), and the headmaster switches it off instead.
 */
export const deletePointType = defineUseCase({
  name: 'pointTypes.delete',
  mode: 'write',
  input: deletePointTypeInput,
  output: deletePointTypeOutput,
  access: { kind: 'gate', check: () => ({ action: 'pointTypes.manage' }) },
  async execute({ tx }, input) {
    const current = await tx.pointTypes.get(input.id);
    if (!current) return fail({ code: 'not-found' });
    if (current.version !== input.expectedVersion) return fail({ code: 'conflict' });
    if (current.locked) return fail({ code: 'rule', rule: 'type-locked' });
    await tx.pointTypes.remove(current.id, current.version);
    await tx.audit.record(pointTypeDeletedEvent(current));
    return ok({ id: current.id });
  },
});
