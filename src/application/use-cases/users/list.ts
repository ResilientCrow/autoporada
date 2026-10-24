import { defineUseCase, ok } from '@/application/core';
import { listUsersInput, listUsersOutput } from '@/contracts';

import { selectUsers } from './select';

/** „Uživatelé“: reading needs no step-up, only `users.view`. */
export const listUsers = defineUseCase({
  name: 'users.list',
  mode: 'read',
  input: listUsersInput,
  output: listUsersOutput,
  access: { kind: 'gate', check: () => ({ action: 'users.view' }) },
  async execute({ tx }, input) {
    const { rows, total } = selectUsers(await tx.users.list(), {
      text: input.q,
      group: input.group,
    });
    return ok({
      users: rows.map((u) => ({
        id: u.id,
        displayName: u.displayName,
        email: u.email,
        role: u.role,
        status: u.status,
        isStudent: u.isStudent,
      })),
      total,
    });
  },
});
