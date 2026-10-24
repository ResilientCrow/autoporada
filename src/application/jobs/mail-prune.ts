import { JOB_TX_TIMEOUT_MS, system, type JobHandler } from '@/application/ports';
import { MAIL_LEDGER_RETENTION_DAYS } from '@/domain/retention';

const DAY_MS = 86_400_000;

/**
 * Deletes ledger rows settled (or claimed and never settled) more than
 * MAIL_LEDGER_RETENTION_DAYS ago, skipped rows included. It reconciles to now: one run
 * after an outage does what the missed runs would have, and a second run deletes nothing.
 */
export const mailPrune: JobHandler<'mail.prune'> = async ({ db, clock }, job) => {
  const now = clock.now();
  const cutoff = new Date(now.getTime() - MAIL_LEDGER_RETENTION_DAYS * DAY_MS);
  await db.transaction(
    { principal: system('job:mail.prune'), now, requestId: job.id },
    { mode: 'write', transactionTimeoutMs: JOB_TX_TIMEOUT_MS },
    (tx) => tx.mailLedger.purgeBefore(cutoff),
  );
  return { kind: 'done', code: 'purged' };
};
