import { runUseCase } from '@/application/core';
import { system, type AppDeps, type UserPrincipal } from '@/application/ports';
import { resolveSession } from '@/application/use-cases';

import { digest, isToken } from './tokens';

/**
 * The container's resolvePrincipal: the signed-in user behind a session
 * cookie, or null. A cookie that is not a well-formed token is never looked
 * up. An outage, or a lookup refused as busy or conflicting, throws: the
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
    if (!result.ok) throw new Error(`auth.resolveSession: ${result.error.code}`);
    if (!result.value.found) return null;
    const { sessionId, authTime, actor } = result.value;
    return { kind: 'user', actor, sessionId, authTime: new Date(authTime) };
  };
}
