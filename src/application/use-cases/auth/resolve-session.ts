import { defineSystemUseCase, ok } from '@/application/core';
import { resolveSessionInput, resolveSessionOutput } from '@/contracts';
import { sessionVerdict, touched } from '@/domain/identity';

/**
 * The signed-in user behind a session cookie, on every request (plan §4):
 * role and status as stored now, nothing for an expired session or an
 * inactive user. Pushes the idle limit at most every 5 minutes; touches
 * are deliberately not audited.
 */
export const resolveSession = defineSystemUseCase({
  name: 'auth.resolveSession',
  reasons: ['auth.session'],
  mode: 'write',
  input: resolveSessionInput,
  output: resolveSessionOutput,
  async execute({ tx, now }, input) {
    const found = await tx.sessions.find(input.tokenSha256);
    if (!found) return ok({ found: false });
    const { session, user } = found;
    const verdict = sessionVerdict(session, now);
    if (verdict === 'expired' || user.status !== 'active') return ok({ found: false });
    if (verdict === 'touch') {
      await tx.sessions.touch(session.id, touched(session, now));
      tx.audit.exempt('session-touch', { type: 'session', id: session.id });
    }
    return ok({
      found: true,
      sessionId: session.id,
      authTime: session.authTime.toISOString(),
      actor: { id: user.id, role: user.role, status: user.status, isStudent: user.isStudent },
    });
  },
});
