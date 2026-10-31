import { defineUseCase, fail, ok } from '@/application/core';
import { readRegistryInput, readRegistryOutput } from '@/contracts';
import { sortForDocument } from '@/domain/registry';

/**
 * The registry for the staff: every list with the number of its active entries and how many of
 * them were never printed, and, for the list a `key` names, its entries in the document's order
 * (class, surname, given name). Students are children: the policy is `registry.view`, a staff
 * reviewer's. Inactive lists are listed too, so they can be switched on again.
 */
export const readRegistry = defineUseCase({
  name: 'registry.read',
  mode: 'read',
  input: readRegistryInput,
  output: readRegistryOutput,
  access: { kind: 'gate', check: () => ({ action: 'registry.view' }) },
  async execute({ tx }, input) {
    const lists = await tx.registry.lists();
    const counts = new Map((await tx.registry.counts()).map((c) => [c.listId, c]));
    const withCounts = lists.map((list) => ({
      ...list,
      active: counts.get(list.id)?.active ?? 0,
      fresh: counts.get(list.id)?.fresh ?? 0,
    }));
    if (input.key === undefined) return ok({ lists: withCounts, current: null });
    const list = lists.find((l) => l.key === input.key);
    if (!list) return fail({ code: 'not-found' });
    const entries = sortForDocument(await tx.registry.entries(list.id)).map((entry) => ({
      id: entry.id,
      givenName: entry.givenName,
      familyName: entry.familyName,
      classCode: entry.classCode,
      version: entry.version,
      isNew: entry.firstPublishedIssueId === null,
    }));
    return ok({ lists: withCounts, current: { list, entries } });
  },
});
