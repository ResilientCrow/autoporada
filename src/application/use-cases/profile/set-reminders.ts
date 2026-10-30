import { defineUseCase, fail, ok } from '@/application/core';
import { setRemindersInput, setRemindersOutput } from '@/contracts';

/**
 * Anyone signed in switches their own soft deadline reminder (the e-mail two days before the
 * deadline) off or on. The form sends the state it wants, so a repeat writes and audits nothing.
 * It is the user's preference, not an access change: the row's version and sessions stay, and the
 * audit meta holds the new state only.
 */
export const setReminders = defineUseCase({
  name: 'profile.setReminders',
  mode: 'write',
  input: setRemindersInput,
  output: setRemindersOutput,
  access: { kind: 'gate', check: () => ({ action: 'profile.manage' }) },
  async execute({ tx, actor }, input) {
    const user = await tx.users.lock(actor.id);
    if (!user) return fail({ code: 'not-found' });
    if (user.remindDeadline === input.on) return ok({ changed: false });
    await tx.users.setReminders(user.id, input.on);
    await tx.audit.record({
      action: 'profile.reminders',
      target: { type: 'user', id: user.id },
      meta: { on: input.on },
    });
    return ok({ changed: true });
  },
});
