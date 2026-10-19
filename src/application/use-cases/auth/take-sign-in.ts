import { defineSystemUseCase, ok } from '@/application/core';
import { takeSignInInput, takeSignInOutput } from '@/contracts';

/**
 * Takes the sign-in a callback answers, by the browser's cookie and Entra's
 * state together. Always answers ok, so the delete commits even when the
 * sign-in has expired: a callback can be used once, whatever happens next.
 */
export const takeSignIn = defineSystemUseCase({
  name: 'auth.takeSignIn',
  reasons: ['auth.callback'],
  mode: 'write',
  input: takeSignInInput,
  output: takeSignInOutput,
  async execute({ tx, now }, input) {
    const signIn = await tx.signIns.take(input.cookieSha256, input.state);
    if (!signIn) return ok({ found: false });
    return ok({
      found: true,
      expired: signIn.expiresAt.getTime() <= now.getTime(),
      purpose: signIn.purpose,
      userId: signIn.userId,
      returnTo: signIn.returnTo,
      startedAtMs: signIn.createdAt.getTime(),
      nonce: signIn.nonce,
      codeVerifier: signIn.codeVerifier,
    });
  },
});
