import { endedMailSent, mailJob } from '@/application/notifications';
import { JOB_TX_TIMEOUT_MS, system, type JobHandler } from '@/application/ports';
import { reportPromptStage, reportPromptWindow } from '@/domain/review';
import { instantToWallClock } from '@/domain/time';

const PRINCIPAL = system('job:future.report-prompt');

/**
 * Asks the author of an approved akce that is over to write the report: one mail the day
 * after, a second a week later, nothing after three weeks. It reconciles to today's Prague
 * date, so a run after an outage sends what is due now, and the mail ledger (keyed by
 * author, akce and stage) makes a second run send nothing.
 */
export const reportPrompt: JobHandler<'future.report-prompt'> = async ({ db, clock }, job) => {
  const sent = await db.transaction(
    { principal: PRINCIPAL, now: clock.now(), requestId: job.id },
    { mode: 'write', transactionTimeoutMs: JOB_TX_TIMEOUT_MS },
    async (tx) => {
      const today = instantToWallClock(tx.ctx.now).date;
      const items = await tx.futureItems.reportPromptDue(reportPromptWindow(today));
      let enqueued = 0;
      for (const item of items) {
        const stage = reportPromptStage(item.lastDay, today);
        if (stage === null) continue;
        const { data, dedupeKey } = mailJob('report.prompt', {
          authorId: item.authorId,
          itemId: item.id,
          stage,
        });
        if (await tx.mailLedger.get(dedupeKey)) continue;
        // The mail at the akce's end already asked for the report (ADR 0035 item 7); stage 2 stays.
        if (stage === 1 && (await endedMailSent(tx, item))) continue;
        await tx.jobs.enqueue('mail.send', data, { dedupeKey });
        enqueued += 1;
      }
      return enqueued;
    },
  );
  return { kind: 'done', code: sent > 0 ? 'prompted' : 'none' };
};
