import { defineUseCase, fail, ok } from '@/application/core';
import { setAddressInput, setAddressOutput } from '@/contracts';
import { can } from '@/domain/policy';
import { salutationsFor } from '@/domain/cs';

import { lockedActor } from './locked-actor';

const FIELDS = ['salutation', 'titlesBefore', 'titlesAfter'] as const;

/**
 * A person sets how documents address them: a salutation and their degrees, on their own row only
 * (ADR 0072 item 6). `profile.manage` is the own-profile action: every active account holds it,
 * a pending one too, and a blocked one does not. The row is locked first and `can()` is asked
 * again of it. The salutation must be one the person's tier offers (students and absolventi:
 * pan or slečna, anyone else pan or paní), so a tier change makes Arch ask again. An address is
 * not access: no version bump, no session ends. The audit log names the fields that changed,
 * never what they say.
 */
export const setAddress = defineUseCase({
  name: 'users.setAddress',
  mode: 'write',
  input: setAddressInput,
  output: setAddressOutput,
  access: { kind: 'gate', check: () => ({ action: 'profile.manage' }) },
  async execute({ tx, actor }, input) {
    const current = await lockedActor(tx, actor);
    if (!current || !can(current, { action: 'profile.manage' })) return fail({ code: 'forbidden' });
    const user = await tx.users.get(actor.id);
    if (!user) return fail({ code: 'not-found' });
    if (!salutationsFor(current.isStudent).includes(input.salutation)) {
      return fail({ code: 'invalid-input', fields: { salutation: 'invalid' } });
    }
    const fields = FIELDS.filter((field) => input[field] !== user[field]);
    if (fields.length === 0) return ok({ changed: false });
    await tx.users.setAddress(user.id, {
      salutation: input.salutation,
      titlesBefore: input.titlesBefore,
      titlesAfter: input.titlesAfter,
    });
    await tx.audit.record({
      action: 'user.address.change',
      target: { type: 'user', id: user.id },
      meta: { fields },
    });
    return ok({ changed: true });
  },
});
