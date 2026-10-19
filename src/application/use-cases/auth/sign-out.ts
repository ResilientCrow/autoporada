import { defineUseCase, ok } from '@/application/core';
import { signOutInput, signOutOutput } from '@/contracts';

/** „Odhlásit se“ ends this session; „Odhlásit všude“ every session of the user. */
export const signOut = defineUseCase({
  name: 'auth.signOut',
  mode: 'write',
  input: signOutInput,
  output: signOutOutput,
  access: { kind: 'gate', check: () => ({ action: 'profile.manage' }) },
  async execute({ tx, principal, actor }, input) {
    const ended = await tx.sessions.end(
      input.everywhere ? { userId: actor.id } : { id: principal.sessionId },
    );
    await tx.audit.record({
      action: 'auth.logout',
      target: { type: 'user', id: actor.id },
      related: ended.map((id) => ({ type: 'session', id })),
      meta: { everywhere: input.everywhere },
    });
    return ok({ ended: ended.length });
  },
});
