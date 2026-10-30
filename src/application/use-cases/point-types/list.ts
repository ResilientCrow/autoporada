import { defineUseCase, ok } from '@/application/core';
import { listPointTypesInput, listPointTypesOutput } from '@/contracts';

/**
 * The types the chooser on /body/novy offers (design section 6): the active
 * ones in `position` order, each as an id and a name. Whoever may start a
 * point may see them. The type admin asks for `includeInactive`: every type,
 * with what its form edits, for the headmaster only.
 */
export const listPointTypes = defineUseCase({
  name: 'pointTypes.list',
  mode: 'read',
  input: listPointTypesInput,
  output: listPointTypesOutput,
  access: {
    kind: 'gate',
    check: (input) => ({ action: input.includeInactive ? 'pointTypes.manage' : 'point.create' }),
  },
  async execute({ tx }, input) {
    const types = await tx.pointTypes.list();
    if (input.includeInactive) {
      return ok({
        types: types.map(({ id, name, ...detail }) => ({ id, name, detail })),
      });
    }
    return ok({
      types: types.filter((type) => type.active).map(({ id, name }) => ({ id, name })),
    });
  },
});
