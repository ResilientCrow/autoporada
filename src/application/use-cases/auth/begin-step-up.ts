import { defineUseCase, ok } from '@/application/core';
import { beginSignInInput, beginSignInOutput } from '@/contracts';
import { safeReturnTo, SIGN_IN_TTL_MS } from '@/domain/identity';

/**
 * A signed-in user asks to prove it is still them (prompt=login) before a
 * step-up action (ADR 0002). The sign-in is bound to their own account.
 */
export const beginStepUp = defineUseCase({
  name: 'auth.beginStepUp',
  mode: 'write',
  input: beginSignInInput,
  output: beginSignInOutput,
  access: { kind: 'gate', check: () => ({ action: 'profile.manage' }) },
  async execute({ tx, now, actor }, input) {
    await tx.signIns.save(input.cookieSha256, {
      purpose: 'step_up',
      userId: actor.id,
      returnTo: safeReturnTo(input.returnTo),
      state: input.state,
      nonce: input.nonce,
      codeVerifier: input.codeVerifier,
      expiresAt: new Date(now.getTime() + SIGN_IN_TTL_MS),
    });
    return ok({});
  },
});
