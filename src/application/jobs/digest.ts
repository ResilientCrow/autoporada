import { digestFacts, hasNews, isReviewer, mailJob } from '@/application/notifications';
import { JOB_TX_TIMEOUT_MS, system, type JobHandler } from '@/application/ports';
import { digestSlot } from '@/domain/calendar';
import { instantToWallClock } from '@/domain/time';

const PRINCIPAL = system('job:reviewer.digest');

/**
 * Twice a working day (07.00 and 15.00 Prague): tells each reviewer and the headmaster that
 * something came in for review since their last digest (design section 13). It reconciles to the
 * clock and the data, so a rerun adds nothing: the ledger key is per person, Prague day and slot,
 * and a slot with no news enqueues no mail. The counts are read again when the mail goes.
 */
export const reviewerDigest: JobHandler<'reviewer.digest'> = async ({ db, clock }, job) => {
  const enqueued = await db.transaction(
    { principal: PRINCIPAL, now: clock.now(), requestId: job.id },
    { mode: 'write', transactionTimeoutMs: JOB_TX_TIMEOUT_MS },
    async (tx) => {
      const { now } = tx.ctx;
      const date = instantToWallClock(now).date;
      const slot = digestSlot(now);
      let count = 0;
      for (const user of (await tx.users.list()).filter(isReviewer)) {
        const { data, dedupeKey } = mailJob('reviewer.digest', { userId: user.id, date, slot });
        if (await tx.mailLedger.get(dedupeKey)) continue;
        if (!hasNews(await digestFacts(tx, user))) continue;
        await tx.jobs.enqueue('mail.send', data, { dedupeKey });
        count += 1;
      }
      return count;
    },
  );
  return { kind: 'done', code: enqueued > 0 ? 'digested' : 'none' };
};
