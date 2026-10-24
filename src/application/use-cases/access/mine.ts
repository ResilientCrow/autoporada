import { defineUseCase, fail, ok } from '@/application/core';
import { myAccessInput, myAccessOutput } from '@/contracts';
import { requestStanding } from '@/domain/review';

/**
 * What „Žádost o přístup“ shows: `member` for anyone who has access, else the
 * person's standing. Only their own requests are ever read.
 */
export const myAccess = defineUseCase({
  name: 'access.mine',
  mode: 'read',
  input: myAccessInput,
  output: myAccessOutput,
  access: { kind: 'gate', check: () => ({ action: 'profile.manage' }) },
  async execute({ tx, actor, now }) {
    if (actor.role !== 'pending') return ok({ standing: { kind: 'member' } });
    const requests = await tx.accessRequests.forUser(actor.id);
    const standing = requestStanding(requests, now);
    switch (standing.kind) {
      case 'open':
        return ok({ standing });
      case 'blocked':
        return ok({ standing: { kind: 'blocked', decidedAt: standing.decidedAt.toISOString() } });
      case 'cooldown':
        return ok({
          standing: {
            kind: 'cooldown',
            decidedAt: standing.decidedAt.toISOString(),
            until: standing.until.toISOString(),
          },
        });
      case 'pending': {
        const request = requests.find((r) => r.id === standing.requestId);
        if (!request) return fail({ code: 'not-found' });
        return ok({
          standing: {
            kind: 'pending',
            requestId: request.id,
            version: request.version,
            reason: request.reason,
            createdAt: request.createdAt.toISOString(),
          },
        });
      }
    }
  },
});
