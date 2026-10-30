import { defineUseCase, diffRecords, fail, ok } from '@/application/core';
import type { PointTypeRecord, PointTypeValues } from '@/application/ports';
import { savePointTypeInput, savePointTypeOutput } from '@/contracts';

import { pointTypeEvent, POINT_TYPE_AUDIT } from './events';

/**
 * The headmaster makes a point type or changes one: its name, title gender,
 * the bullets a new draft starts with, whether the chooser offers it, and its
 * place in the list. The form sends the whole type; a save that changes
 * nothing writes nothing. „Jiné“ (locked) is never switched off. The name is
 * checked here and again by the database at commit (rule `type-name-taken`),
 * so two headmasters racing on one name get the same answer. Drafts already
 * started keep the bullets they copied.
 */
export const savePointType = defineUseCase({
  name: 'pointTypes.save',
  mode: 'write',
  input: savePointTypeInput,
  output: savePointTypeOutput,
  access: { kind: 'gate', check: () => ({ action: 'pointTypes.manage' }) },
  async execute({ tx }, input) {
    const types = await tx.pointTypes.list();
    const current = input.id === undefined ? null : types.find((t) => t.id === input.id);
    if (current === undefined) return fail({ code: 'not-found' });
    if (current && current.version !== input.expectedVersion) return fail({ code: 'conflict' });
    if (current?.locked && !input.active) return fail({ code: 'rule', rule: 'type-locked' });
    if (types.some((t) => t.id !== current?.id && t.name === input.name)) {
      return fail({ code: 'rule', rule: 'type-name-taken' });
    }

    const last = Math.max(0, ...types.map((t) => t.position));
    const values: PointTypeValues = {
      name: input.name,
      titleGender: input.titleGender,
      defaultBullets: input.defaultBullets,
      active: input.active,
      position: input.position ?? current?.position ?? last + 1,
    };
    if (current && !hasChanged(current, values)) {
      return ok({ id: current.id, version: current.version, changed: false });
    }
    const after = current
      ? await tx.pointTypes.update(current.id, current.version, values)
      : await tx.pointTypes.create(values);
    await tx.audit.record(
      pointTypeEvent(current ? 'point_type.changed' : 'point_type.created', current ?? null, after),
    );
    return ok({ id: after.id, version: after.version, changed: true });
  },
});

/** Whether `values` differ from the stored type in anything the audit log shows. */
function hasChanged(current: PointTypeRecord, values: PointTypeValues): boolean {
  return Object.keys(diffRecords(POINT_TYPE_AUDIT, current, { ...current, ...values })).length > 0;
}
