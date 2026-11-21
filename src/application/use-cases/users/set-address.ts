import { defineUseCase, fail, ok } from '@/application/core';
import { setAddressInput, setAddressOutput } from '@/contracts';
import { can } from '@/domain/policy';
import { salutationsFor } from '@/domain/cs';

import { lockedActor } from './locked-actor';

/**
 * A person sets how documents address them: a salutation, on their own row only (ADR 0072 item
 * 6; no degrees, ADR 0076). `profile.manage` is the own-profile action: every active account holds it,
 * a pending one too, and a blocked one does not. The row is locked first and `can()` is asked
 * again of it. The salutation must be one the person's tier offers (students and absolventi:
 * pan or slečna, anyone else pan or paní), so a tier change makes Arch ask again. An address is
 * not access: no version bump, no session ends. The audit log names the field that changed,
 * never what it says.
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
    if (input.salutation === user.salutation) return ok({ changed: false });
    await tx.users.setAddress(user.id, { salutation: input.salutation });
    await tx.audit.record({
      action: 'user.address.change',
      target: { type: 'user', id: user.id },
      meta: { fields: ['salutation'] },
    });
    return ok({ changed: true });
  },
});
