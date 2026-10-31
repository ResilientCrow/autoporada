import { defineUseCase, fail, ok } from '@/application/core';
import type { RegistryListValues } from '@/application/ports';
import { saveListInput, saveListOutput } from '@/contracts';
import { listKeyFor } from '@/domain/registry';

const FIELDS = ['title', 'docLabel', 'active'] as const;

/**
 * The headmaster makes a list for point 4 or changes one: its title, the label the document
 * prints and whether it is on offer. A new list goes last and its key is made from the title. The
 * list of Příloha 1 can be renamed but never switched off (`registry-list-fixed`). A title in use
 * is `registry-list-taken`, checked here and by the database at commit. A save that changes
 * nothing writes nothing. The audit event names the list by its key and the fields that changed.
 */
export const saveList = defineUseCase({
  name: 'registry.saveList',
  mode: 'write',
  input: saveListInput,
  output: saveListOutput,
  access: { kind: 'gate', check: () => ({ action: 'registry.edit' }) },
  async execute({ tx }, input) {
    const values: RegistryListValues = {
      title: input.title,
      docLabel: input.docLabel,
      active: input.active,
    };
    const lists = await tx.registry.lists();
    const current = input.id === undefined ? null : lists.find((l) => l.id === input.id);
    if (current === undefined) return fail({ code: 'not-found' });
    if (current && input.version === undefined) {
      return fail({ code: 'invalid-input', fields: { version: 'required' } });
    }
    if (current && current.version !== input.version) return fail({ code: 'conflict' });
    if (current?.purpose === 'annex1' && !values.active) {
      return fail({ code: 'rule', rule: 'registry-list-fixed' });
    }
    if (lists.some((l) => l.id !== current?.id && l.title === values.title)) {
      return fail({ code: 'rule', rule: 'registry-list-taken' });
    }
    const fields = current ? FIELDS.filter((field) => current[field] !== values[field]) : FIELDS;
    if (current && fields.length === 0) {
      return ok({ id: current.id, version: current.version, changed: false });
    }
    const after = current
      ? await tx.registry.updateList(current.id, current.version, values)
      : await tx.registry.createList(
          listKeyFor(values.title, new Set(lists.map((l) => l.key))),
          values,
        );
    await tx.audit.record({
      action: 'registry.list_saved',
      target: { type: 'registry_list', id: after.id },
      meta: { listKey: after.key, fields: [...fields] },
    });
    return ok({ id: after.id, version: after.version, changed: true });
  },
});
