import { z } from 'zod';

import { loadSubject, stillApplies, viewOf, type MailSubjects } from '@/application/notifications';
import {
  JOB_TX_TIMEOUT_MS,
  system,
  type DoneDetail,
  type JobHandler,
  type JobInput,
  type JobOutcome,
  type MailResult,
  type Settlement,
  type Tx,
} from '@/application/ports';
import { renderMail, type TemplateName } from '@/notify';

import { claimDecision, paceDecision, WINDOW_MS } from './mail-claim';

const PRINCIPAL = system('job:mail.send');
/** How long an auth refusal pauses every send: one Graph call a minute while RBAC propagates. */
const AUTH_PAUSE_MS = 60_000;
/** An address Graph takes: zod's check, printable ASCII only. */
const ADDRESS = z.email().regex(/^[\x21-\x7e]+$/);

type Data = JobInput<'mail.send'>['data'];
/** What the ledger's rules read of the job itself. */
type Revival = Pick<JobInput<'mail.send'>, 'redriven' | 'id'>;

/** A key claimed in the ledger: the call may go out. */
interface Claimed {
  readonly kind: 'send';
  readonly to: string;
  /** The request or user the mail is about, as read in the claim. */
  readonly about: MailSubjects[TemplateName];
  readonly resend: boolean;
  /** The count the claim wrote. */
  readonly unknownSends: number;
}

const done = (code: string, detail?: DoneDetail): JobOutcome =>
  detail ? { kind: 'done', code, detail } : { kind: 'done', code };

/**
 * Under the gate lock: the ledger's rules, then the recipient and the
 * subject read again. A recipient who is gone leaves no row (nothing to
 * keep about them); no usable address, or a mail the account no longer
 * bears out, is recorded as skipped. Only then is the key claimed.
 */
async function claim(tx: Tx, dedupeKey: string, data: Data, job: Revival) {
  const { now } = tx.ctx;
  await tx.mailLedger.lockGate();
  const row = await tx.mailLedger.get(dedupeKey);
  const decision = claimDecision({ row, redriven: job.redriven, jobId: job.id });
  if (decision.kind === 'stop') return decision.outcome;
  const recipient = await tx.users.get(data.recipientId);
  if (!recipient) return done('skipped.recipient-gone');
  const about = await loadSubject(tx, data.template, data.subjectId);
  const skip = async (code: 'skipped.no-address' | 'skipped.stale') => {
    await tx.mailLedger.skip({ dedupeKey, ...data, code });
    return done(code);
  };
  const to = recipient.email;
  if (to === null || !ADDRESS.safeParse(to).success) return skip('skipped.no-address');
  if (!about || !stillApplies(data.template, about, recipient)) return skip('skipped.stale');
  if (decision.kind === 'fail') {
    await tx.mailLedger.settle(dedupeKey, decision.settlement);
    return decision.outcome;
  }
  const gate = await tx.mailLedger.gate();
  const calls = await tx.mailLedger.callsSince(new Date(now.getTime() - WINDOW_MS));
  const wait = paceDecision({ gate, calls, now });
  if (wait) return wait;
  const { unknownSends, capFrom, resend } = decision;
  await tx.mailLedger.claim({ dedupeKey, ...data, unknownSends, capFrom, jobId: job.id });
  return { kind: 'send', to, about, resend, unknownSends } satisfies Claimed;
}

/** How the ledger records the provider's answer, and what the queue does next. */
function outcomeOf(
  result: MailResult,
  claimed: Claimed,
  now: Date,
  ms: number,
): { settlement: Settlement; outcome: JobOutcome; closeGate?: Date } {
  const later = (ms: number) => new Date(now.getTime() + ms);
  switch (result.kind) {
    case 'sent': {
      const code = claimed.resend ? 'resent' : 'sent';
      return {
        settlement: { state: 'sent', code, graphRequestId: result.requestId },
        outcome: done(code, { graphRequestId: result.requestId, ms }),
      };
    }
    case 'rejected':
      return {
        settlement: { state: 'failed', code: result.code },
        outcome: { kind: 'dead', code: result.code },
      };
    case 'unknown':
      return {
        settlement: { state: 'unknown', code: result.code, unknownSends: claimed.unknownSends + 1 },
        outcome: { kind: 'retry', code: result.code },
      };
    case 'throttled': {
      // The runner holds for it; a hold past the execution deadline costs a retry there.
      const until = later(result.retryAfterMs);
      return {
        settlement: { state: 'deferred', code: result.code },
        outcome: { kind: 'wait', until, code: result.code },
        closeGate: until,
      };
    }
    case 'auth':
      // One retry per Graph call: the job's retries are the budget for RBAC to propagate.
      return {
        settlement: { state: 'deferred', code: result.code },
        outcome: { kind: 'retry', code: result.code },
        closeGate: later(AUTH_PAUSE_MS),
      };
    case 'not-sent':
      return {
        settlement: { state: 'deferred', code: result.code },
        outcome: { kind: 'retry', code: result.code },
      };
  }
}

/**
 * Sends one mail (ADR 0016): claim in one transaction, render and call the
 * transport outside any, settle in a second. A job without a dedupe key is
 * refused: nothing could then stop a second copy.
 */
export const mailSend: JobHandler<'mail.send'> = async ({ db, clock, mail, appOrigin }, job) => {
  const key = job.dedupeKey;
  if (key === null) return { kind: 'dead', code: 'no-key' };
  const write = <T>(work: (tx: Tx) => Promise<T>) =>
    db.transaction(
      { principal: PRINCIPAL, now: clock.now(), requestId: job.id },
      { mode: 'write', transactionTimeoutMs: JOB_TX_TIMEOUT_MS },
      work,
    );
  const claimed = await write((tx) => claim(tx, key, job.data, job));
  if (claimed.kind !== 'send') return claimed;
  const { template } = job.data;
  const { subject, text } = renderMail(template, viewOf(template, claimed.about), appOrigin);
  const startedAt = clock.now().getTime();
  const result = await mail.send({ to: claimed.to, subject, text, dedupeKey: key });
  // A clock that stepped back mid-call must not log a negative time.
  const ms = Math.max(0, clock.now().getTime() - startedAt);
  return write(async (tx) => {
    const { settlement, outcome, closeGate } = outcomeOf(result, claimed, tx.ctx.now, ms);
    await tx.mailLedger.settle(key, settlement);
    if (closeGate) await tx.mailLedger.closeGate(closeGate, settlement.code);
    return outcome;
  });
};
