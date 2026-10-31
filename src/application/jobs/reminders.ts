import { readSettingValue } from '@/application/core';
import {
  activeSubmitters,
  authorsWaiting,
  mailJob,
  reminderIssue,
} from '@/application/notifications';
import { JOB_TX_TIMEOUT_MS, system, type JobHandler } from '@/application/ports';
import { reminderDue, reminderSlot, reminderStagger, type ReminderKind } from '@/domain/calendar';

const PRINCIPAL = system('job:reminders.deadline');
const TEMPLATE = { soft: 'reminder.soft', hard: 'reminder.hard' } as const;

/**
 * Every 15 minutes: while a reminder's slot is open for the Monday being collected, mails whoever
 * it is for and has not been mailed (design section 13, D7). It reconciles to the clock and the
 * data, so a rerun enqueues nothing new: the ledger key is per Monday and person, and the start is
 * the slot plus a fixed offset from the recipient's id, so recipients are spread over half an hour.
 * A kind the headmaster switched off (the `reminders` setting) is skipped whole.
 */
export const deadlineReminders: JobHandler<'reminders.deadline'> = async ({ db, clock }, job) => {
  const enqueued = await db.transaction(
    { principal: PRINCIPAL, now: clock.now(), requestId: job.id },
    { mode: 'write', transactionTimeoutMs: JOB_TX_TIMEOUT_MS },
    async (tx) => {
      const { now } = tx.ctx;
      const issue = await reminderIssue(tx, now);
      const switches = await readSettingValue(tx, 'reminders');
      let count = 0;
      for (const kind of ['soft', 'hard'] as const satisfies readonly ReminderKind[]) {
        if (!switches[kind] || !reminderDue(kind, issue.deadlineAt, now)) continue;
        const recipients =
          kind === 'soft'
            ? await activeSubmitters(tx, now)
            : await authorsWaiting(tx, issue.monday, now);
        const slot = reminderSlot(kind, issue.deadlineAt).getTime();
        for (const userId of recipients) {
          const { data, dedupeKey } = mailJob(TEMPLATE[kind], { userId, monday: issue.monday });
          if (await tx.mailLedger.get(dedupeKey)) continue;
          const startAfter = new Date(slot + reminderStagger(userId));
          await tx.jobs.enqueue('mail.send', data, { dedupeKey, startAfter });
          count += 1;
        }
      }
      return count;
    },
  );
  return { kind: 'done', code: enqueued > 0 ? 'reminded' : 'none' };
};
