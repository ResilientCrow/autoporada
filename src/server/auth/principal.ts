import { runUseCase } from '@/application/core';
import {
  LockTimeout,
  system,
  TransactionConflict,
  type AppDeps,
  type UserPrincipal,
} from '@/application/ports';
import { resolveSession } from '@/application/use-cases';

import { digest, isToken } from './tokens';

/**
 * The container's resolvePrincipal: the signed-in user behind a session
 * cookie, or null. A cookie that is not a well-formed token is never looked
 * up. An outage, or a lookup refused as busy or conflicting, throws (the port error, so its kind survives): the
 * request fails closed, and a sign-out never mistakes it for no session.
 */
export function principalResolver(
  app: AppDeps,
): (token: string | null, requestId: string) => Promise<UserPrincipal | null> {
  return async (token, requestId) => {
    if (!isToken(token)) return null;
    const result = await runUseCase(
      resolveSession,
      { principal: system('auth.session'), requestId, input: { tokenSha256: digest(token) } },
      app,
    );
    if (!result.ok) {
      // The use case folded the port error into a code; give the port error back, so the
      // failure keeps its kind (a busy lock is a timeout, not a bug; ADR 0044).
      if (result.error.code === 'busy') throw new LockTimeout();
      if (result.error.code === 'conflict') throw new TransactionConflict();
      throw new Error(`auth.resolveSession: ${result.error.code}`);
    }
    if (!result.value.found) return null;
    const { sessionId, authTime, actor } = result.value;
    return { kind: 'user', actor, sessionId, authTime: new Date(authTime) };
  };
}
