import { defineSystemUseCase, ok } from '@/application/core';
import { completeSignInInput, completeSignInOutput } from '@/contracts';
import { isStudentTier } from '@/domain/actor';
import { bootstrapsHeadmaster, newSessionTimes } from '@/domain/identity';

import { bootstrapEvent, loginEvent, rejectedEvent } from './events';

/**
 * Turns an identity Entra verified (and checkEntraClaims accepted) into a
 * session, in one transaction: step-up account check, user upsert, status,
 * the first headmaster, ending the browser's previous session, the new
 * session and the audit event. Refusals are answers, not failures: they
 * commit their audit event and create no session.
 */
export const completeSignIn = defineSystemUseCase({
  name: 'auth.completeSignIn',
  reasons: ['auth.callback'],
  mode: 'write',
  input: completeSignInInput,
  output: completeSignInOutput,
  async execute({ tx, now }, input) {
    const { purpose, identity } = input;
    if ((purpose === 'step_up') !== (input.expectedUserId !== null)) {
      throw new Error('auth.completeSignIn: a step-up needs the expected user, a login none');
    }
    if (input.expectedUserId !== null) {
      const current = await tx.users.get(input.expectedUserId);
      if (!current || current.tid !== identity.tid || current.oid !== identity.oid) {
        await tx.audit.record(
          rejectedEvent(current?.id ?? null, { reason: 'other-account', purpose }),
        );
        return ok({ outcome: 'refused', reason: 'other-account' });
      }
    }

    let user = await tx.users.upsertFromClaims({ ...identity, jobTitle: null, department: null });
    if (user.status !== 'active') {
      await tx.audit.record(rejectedEvent(user.id, { reason: 'inactive', purpose }));
      return ok({ outcome: 'refused', reason: 'inactive' });
    }

    const bootstrapped = bootstrapsHeadmaster({
      configuredOid: input.bootstrapHeadmasterOid,
      oid: user.oid,
      purpose,
      role: user.role,
      status: user.status,
      activeHeadmasters: await tx.users.countActiveHeadmasters(),
    });
    if (bootstrapped) {
      // Before the session: an access change ends the user's sessions.
      const before = user;
      // A student tier cannot hold the role (users_student_role): it is cleared, as the flag was.
      user = await tx.users.changeAccess(user.id, user.version, {
        role: 'headmaster',
        ...(isStudentTier(user.tier) && { tier: null }),
      });
      await tx.audit.record(bootstrapEvent(before, user));
    }

    const ended = input.replacesSessionSha256
      ? await tx.sessions.end({ tokenSha256: input.replacesSessionSha256 })
      : [];
    const session = await tx.sessions.create({
      tokenSha256: input.sessionTokenSha256,
      userId: user.id,
      authTime: new Date(input.authTime * 1000),
      ...newSessionTimes(now),
    });
    const firstSignIn = user.createdAt.getTime() === now.getTime();
    await tx.audit.record(
      loginEvent({
        userId: user.id,
        sessionId: session.id,
        ended,
        meta: { purpose, bootstrapped, firstSignIn },
      }),
    );
    return ok({ outcome: 'signed-in', userId: user.id, bootstrapped });
  },
});
