import { defineUseCase, ok } from '@/application/core';
import { listPointTypesInput, listPointTypesOutput } from '@/contracts';

/**
 * The types the chooser on /body/novy offers (design section 6): the active
 * ones in `position` order, each as an id and a name. Whoever may start a
 * point may see them; the headmaster's list with the retired types joins the
 * type admin (design row 49).
 */
export const listPointTypes = defineUseCase({
  name: 'pointTypes.list',
  mode: 'read',
  input: listPointTypesInput,
  output: listPointTypesOutput,
  access: { kind: 'gate', check: () => ({ action: 'point.create' }) },
  async execute({ tx }) {
    const types = await tx.pointTypes.list();
    return ok({
      types: types.filter((type) => type.active).map(({ id, name }) => ({ id, name })),
    });
  },
});
