import { mailJob, movedRecipients } from '@/application/notifications';
import { JOB_TX_TIMEOUT_MS, system, type JobHandler } from '@/application/ports';

const PRINCIPAL = system('job:issues.moved-notice');

/**
 * Tells the reminders' audience that a porada's deadline came earlier (D21). The move enqueued
 * it with the slot and the deadline it set; this reads the slot again and drops the job when the
 * slot is no longer the one collected or the deadline has changed since. The ledger key is per
 * slot, person and deadline, so a rerun sends nothing.
 */
export const movedNotice: JobHandler<'issues.moved-notice'> = async ({ db, clock }, job) => {
  const enqueued = await db.transaction(
    { principal: PRINCIPAL, now: clock.now(), requestId: job.id },
    { mode: 'write', transactionTimeoutMs: JOB_TX_TIMEOUT_MS },
    async (tx) => {
      const audience = await movedRecipients(tx, job.data);
      if (!audience) return 0;
      const deadlineAt = new Date(job.data.deadlineAt);
      let count = 0;
      for (const userId of audience.userIds) {
        const { data, dedupeKey } = mailJob('issue.moved', {
          userId,
          monday: audience.monday,
          deadlineAt,
        });
        if (await tx.mailLedger.get(dedupeKey)) continue;
        await tx.jobs.enqueue('mail.send', data, { dedupeKey });
        count += 1;
      }
      return count;
    },
  );
  return { kind: 'done', code: enqueued > 0 ? 'notified' : 'none' };
};
