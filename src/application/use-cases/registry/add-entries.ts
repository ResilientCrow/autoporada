import { defineUseCase, fail, ok } from '@/application/core';
import type { RegistryEntryValues } from '@/application/ports';
import { addEntriesInput, addEntriesOutput } from '@/contracts';

import { sameStudent } from './events';

/**
 * The headmaster adds the rows he ticked in the paste preview, or one student from the form, in
 * one transaction: all or none. Each row was validated again by the contract. A student already
 * on the list, or twice in the rows, is the rule `registry-duplicate`; the unique index answers
 * the same when two saves race. The audit event counts the rows and names the list by its key,
 * never a name.
 */
export const addEntries = defineUseCase({
  name: 'registry.addEntries',
  mode: 'write',
  input: addEntriesInput,
  output: addEntriesOutput,
  access: { kind: 'gate', check: () => ({ action: 'registry.edit' }) },
  async execute({ tx }, input) {
    const list = await tx.registry.list(input.listId);
    if (!list) return fail({ code: 'not-found' });
    const taken: RegistryEntryValues[] = [...(await tx.registry.entries(list.id))];
    for (const row of input.rows) {
      if (taken.some((t) => sameStudent(t, row))) {
        return fail({ code: 'rule', rule: 'registry-duplicate' });
      }
      taken.push(row);
    }
    const added = await tx.registry.addEntries(list.id, input.rows);
    await tx.audit.record({
      action: 'registry.entries_added',
      target: { type: 'registry_list', id: list.id },
      meta: { listKey: list.key, count: added.length },
      related: added.map((entry) => ({ type: 'registry_entry', id: entry.id })),
    });
    return ok({ added: added.length });
  },
});
