import { defineUseCase, fail, ok } from '@/application/core';
import { setFunctionsInput, setFunctionsOutput } from '@/contracts';
import { can } from '@/domain/policy';

import { lockedActor } from './locked-actor';

/**
 * A headmaster sets all the functions a person holds (ADR 0072 item 4), under step-up as the rest
 * of Lidé: `users.manage`. Any tier may hold any, and the headmaster's own row is allowed too,
 * since a function grants no rights. The user's row is locked first, as in users.changeAccess, and
 * `can()` is asked again of the headmaster's own row (lockedActor). The form sends the whole
 * list; a list equal to the stored one writes nothing and keeps the version. The audit log names
 * the heads, never the complement text people typed.
 */
export const setFunctions = defineUseCase({
  name: 'users.setFunctions',
  mode: 'write',
  input: setFunctionsInput,
  output: setFunctionsOutput,
  access: {
    kind: 'resource',
    load: (tx, input) => tx.users.lock(input.userId),
    expectedVersion: (input) => input.version,
    check: () => ({ action: 'users.manage' }),
  },
  async execute({ tx, actor }, input, user) {
    const current = await lockedActor(tx, actor);
    if (!current || !can(current, { action: 'users.manage' })) return fail({ code: 'forbidden' });
    const held = (await tx.users.functions([user.id])).get(user.id) ?? [];
    const same =
      held.length === input.functions.length &&
      held.every(
        (f, i) =>
          f.head === input.functions[i]!.head && f.complement === input.functions[i]!.complement,
      );
    if (same) return ok({ changed: false, version: user.version });
    const after = await tx.users.setFunctions(user.id, user.version, input.functions);
    await tx.audit.record({
      action: 'user.functions.change',
      target: { type: 'user', id: user.id },
      meta: { heads: input.functions.map((f) => f.head) },
    });
    return ok({ changed: true, version: after.version });
  },
});
