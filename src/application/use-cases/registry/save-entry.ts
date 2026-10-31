import { defineUseCase, fail, ok } from '@/application/core';
import { saveEntryInput, saveEntryOutput } from '@/contracts';

import { changedEntryFields, sameStudent } from './events';

/**
 * The headmaster corrects one student's names or class, under the version the form read. A save
 * that changes nothing writes nothing. Making the entry equal to another active one of its list
 * is the rule `registry-duplicate`. The audit event names the fields that changed, never what
 * they say.
 */
export const saveEntry = defineUseCase({
  name: 'registry.saveEntry',
  mode: 'write',
  input: saveEntryInput,
  output: saveEntryOutput,
  access: { kind: 'gate', check: () => ({ action: 'registry.edit' }) },
  async execute({ tx }, input) {
    const current = await tx.registry.entry(input.id);
    if (!current || current.removedAt !== null) return fail({ code: 'not-found' });
    if (current.version !== input.version) return fail({ code: 'conflict' });
    const fields = changedEntryFields(current, input);
    if (fields.length === 0) return ok({ version: current.version, changed: false });
    const others = await tx.registry.entries(current.listId);
    if (others.some((o) => o.id !== current.id && sameStudent(o, input))) {
      return fail({ code: 'rule', rule: 'registry-duplicate' });
    }
    const after = await tx.registry.updateEntry(current.id, current.version, input);
    await tx.audit.record({
      action: 'registry.entry_saved',
      target: { type: 'registry_entry', id: after.id },
      meta: { fields: [...fields] },
    });
    return ok({ version: after.version, changed: true });
  },
});
