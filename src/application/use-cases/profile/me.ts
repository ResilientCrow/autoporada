import { defineUseCase, fail, ok } from '@/application/core';
import { meInput, meOutput } from '@/contracts';

/** Who is signed in, for the page header and the pending-approval page. */
export const me = defineUseCase({
  name: 'profile.me',
  mode: 'read',
  input: meInput,
  output: meOutput,
  access: { kind: 'gate', check: () => ({ action: 'profile.manage' }) },
  async execute({ tx, actor }) {
    const user = await tx.users.get(actor.id);
    if (!user) return fail({ code: 'not-found' });
    return ok({ displayName: user.displayName, role: user.role, isStudent: user.isStudent });
  },
});
