import { isHeadmaster, lateSummaryIssue, mailJob, summaryIssue } from '@/application/notifications';
import { JOB_TX_TIMEOUT_MS, system, type JobHandler } from '@/application/ports';

const PRINCIPAL = system('job:headmaster.summary');

/**
 * Every five minutes: once an issue's deadline is five minutes behind and for two hours after,
 * tells each headmaster how it stands (design section 13). It reconciles to the clock and the
 * data, so a rerun adds nothing: the ledger key is per headmaster and Monday. The same run sends the
 * second summary of the late reports in the same window after the last of their closes (ADR 0035). The counts are read
 * again when the mail goes, and a skipped meeting has no summary.
 */
export const headmasterSummary: JobHandler<'headmaster.summary'> = async ({ db, clock }, job) => {
  const enqueued = await db.transaction(
    { principal: PRINCIPAL, now: clock.now(), requestId: job.id },
    { mode: 'write', transactionTimeoutMs: JOB_TX_TIMEOUT_MS },
    async (tx) => {
      const [issue, late] = await Promise.all([
        summaryIssue(tx, tx.ctx.now),
        lateSummaryIssue(tx, tx.ctx.now),
      ]);
      if (!issue && !late) return 0;
      let count = 0;
      for (const user of (await tx.users.list()).filter(isHeadmaster)) {
        const mails = [
          ...(issue
            ? [mailJob('headmaster.summary', { userId: user.id, monday: issue.monday })]
            : []),
          ...(late
            ? [mailJob('headmaster.late-summary', { userId: user.id, monday: late.issue.monday })]
            : []),
        ];
        for (const { data, dedupeKey } of mails) {
          if (await tx.mailLedger.get(dedupeKey)) continue;
          await tx.jobs.enqueue('mail.send', data, { dedupeKey });
          count += 1;
        }
      }
      return count;
    },
  );
  return { kind: 'done', code: enqueued > 0 ? 'summarised' : 'none' };
};
