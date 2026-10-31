import { defineUseCase, fail, ok } from '@/application/core';
import { moveListInput, moveListOutput } from '@/contracts';

/**
 * The headmaster moves a list one place up or down. The first cannot go up and the last cannot
 * go down: that answers `moved: false` and writes nothing. The positions are written as 1..n, so
 * the order stays whole whatever the positions were.
 */
export const moveList = defineUseCase({
  name: 'registry.moveList',
  mode: 'write',
  input: moveListInput,
  output: moveListOutput,
  access: { kind: 'gate', check: () => ({ action: 'registry.edit' }) },
  async execute({ tx }, input) {
    const ids = (await tx.registry.lists()).map((l) => l.id);
    const from = ids.indexOf(input.id);
    if (from < 0) return fail({ code: 'not-found' });
    const to = input.direction === 'up' ? from - 1 : from + 1;
    if (to < 0 || to >= ids.length) return ok({ moved: false });
    [ids[from], ids[to]] = [ids[to] ?? input.id, ids[from] ?? input.id];
    await tx.registry.orderLists(ids);
    await tx.audit.record({
      action: 'registry.list_moved',
      target: { type: 'registry_list', id: input.id },
      meta: { direction: input.direction },
      related: ids.map((id) => ({ type: 'registry_list', id })),
    });
    return ok({ moved: true });
  },
});
