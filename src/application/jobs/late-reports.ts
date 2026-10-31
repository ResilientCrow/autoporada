import { endedAkce, mailJob } from '@/application/notifications';
import { JOB_TX_TIMEOUT_MS, system, type JobHandler } from '@/application/ports';

const PRINCIPAL = system('job:reports.late');

/**
 * Every 15 minutes: mails the author of an akce that has ended and whose report is late, once
 * (ADR 0035 item 6). It reconciles to the clock and the data, never to the tick, so a missed tick
 * is made up while the window is open and a rerun finds the ledger key and sends nothing.
 */
export const lateReports: JobHandler<'reports.late'> = async ({ db, clock }, job) => {
  const enqueued = await db.transaction(
    { principal: PRINCIPAL, now: clock.now(), requestId: job.id },
    { mode: 'write', transactionTimeoutMs: JOB_TX_TIMEOUT_MS },
    async (tx) => {
      let count = 0;
      for (const { item } of await endedAkce(tx, tx.ctx.now)) {
        const { data, dedupeKey } = mailJob('report.ended', {
          authorId: item.authorId,
          itemId: item.id,
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
