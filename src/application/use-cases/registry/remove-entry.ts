import { defineUseCase, fail, ok } from '@/application/core';
import { removeEntryInput, removeEntryOutput } from '@/contracts';

/**
 * The headmaster takes a student off a list (ADR 0033). An entry no document has listed is
 * deleted; one that was printed is kept with `removed_at` set, so a regenerated document still
 * prints it as it was. No version: removing twice finds nothing the second time.
 */
export const removeEntry = defineUseCase({
  name: 'registry.removeEntry',
  mode: 'write',
  input: removeEntryInput,
  output: removeEntryOutput,
  access: { kind: 'gate', check: () => ({ action: 'registry.edit' }) },
  async execute({ tx }, input) {
    const removed = await tx.registry.removeEntry(input.id);
    if (removed === null) return fail({ code: 'not-found' });
    const deleted = removed === 'deleted';
    await tx.audit.record({
      action: 'registry.entry_removed',
      target: { type: 'registry_entry', id: input.id },
      meta: { deleted },
    });
    return ok({ deleted });
  },
});
