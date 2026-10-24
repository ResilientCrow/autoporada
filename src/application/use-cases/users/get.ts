import { defineUseCase, ok } from '@/application/core';
import { getUserInput, getUserOutput } from '@/contracts';
import { accessChoices } from '@/domain/policy';

import { decisionEvents } from '../access/machine';

/**
 * One user for the detail page. Reading needs no step-up. Scope hides other
 * users from anyone but the headmaster, so they read as not-found.
 */
export const getUser = defineUseCase({
  name: 'users.get',
  mode: 'read',
  input: getUserInput,
  output: getUserOutput,
  access: {
    kind: 'resource',
    load: (tx, input) => tx.users.get(input.userId),
    expectedVersion: 'unversioned',
    check: () => ({ action: 'users.view' }),
  },
  async execute({ tx, actor }, _input, user) {
    const [newest] = await tx.accessRequests.forUser(user.id);
    const choices = accessChoices(actor, {
      id: user.id,
      role: user.role,
      isStudent: user.isStudent,
      status: user.status,
      hasPendingRequest: newest?.state === 'pending',
    });
    const requestEvents = newest ? decisionEvents(actor, newest) : [];
    return ok({
      user: {
        id: user.id,
        displayName: user.displayName,
        email: user.email,
        jobTitle: user.jobTitle,
        department: user.department,
        role: user.role,
        status: user.status,
        isStudent: user.isStudent,
        version: user.version,
        createdAt: user.createdAt.toISOString(),
      },
      isSelf: user.id === actor.id,
      choices: {
        roles: [...choices.roles],
        audience: choices.audience,
        statuses: [...choices.statuses],
      },
      request: newest
        ? {
            requestId: newest.id,
            version: newest.version,
            state: newest.state,
            reason: newest.reason,
            createdAt: newest.createdAt.toISOString(),
            decidedAt: newest.decidedAt?.toISOString() ?? null,
          }
        : null,
      requestEvents,
    });
  },
});
