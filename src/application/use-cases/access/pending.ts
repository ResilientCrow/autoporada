import { defineUseCase, ok } from '@/application/core';
import { pendingAccessInput, pendingAccessOutput } from '@/contracts';

import { decisionEvents } from './machine';

/**
 * „Žádosti o přístup“: the requests waiting for the headmaster, oldest
 * first, with the requester's details from one batched read. A request whose
 * user is gone is left out.
 */
export const pendingAccess = defineUseCase({
  name: 'access.pending',
  mode: 'read',
  input: pendingAccessInput,
  output: pendingAccessOutput,
  access: { kind: 'gate', check: () => ({ action: 'access.decide' }) },
  async execute({ tx, actor }) {
    const requests = await tx.accessRequests.pending();
    const users = new Map(
      (await tx.users.getMany(requests.map((r) => r.userId))).map((u) => [u.id, u]),
    );
    const items = requests.flatMap((request) => {
      const user = users.get(request.userId);
      if (!user) return [];
      const events = decisionEvents(actor, request);
      return [
        {
          requestId: request.id,
          version: request.version,
          userId: user.id,
          displayName: user.displayName,
          email: user.email,
          jobTitle: user.jobTitle,
          department: user.department,
          reason: request.reason,
          requestedAt: request.createdAt.toISOString(),
          events,
        },
      ];
    });
    return ok({ items });
  },
});
