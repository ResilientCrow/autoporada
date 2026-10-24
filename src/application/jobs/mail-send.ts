import { z } from 'zod';

import { stillApplies, SUBJECT_REPO } from '@/application/notifications';
import {
  JOB_TX_TIMEOUT_MS,
  system,
  type AccessRequestRecord,
  type JobHandler,
  type JobInput,
  type JobOutcome,
  type MailResult,
  type Settlement,
  type Tx,
  type UserRecord,
} from '@/application/ports';
import { cooldownEnd } from '@/domain/review';
import { instantToWallClock } from '@/domain/time';
import { renderMail, type TemplateName } from '@/notify';

import { claimDecision } from './mail-claim';

const PRINCIPAL = system('job:mail.send');
/** An address Graph takes: zod's check, printable ASCII only. */
const ADDRESS = z.email().regex(/^[\x21-\x7e]+$/);

type Data = JobInput<'mail.send'>['data'];

/** A key claimed in the ledger: the call may go out. */
interface Claimed {
  readonly kind: 'send';
  readonly to: string;
  /** The request or user the mail is about, as read in the claim. */
  readonly about: AccessRequestRecord | UserRecord;
  readonly resend: boolean;
  /** The count the claim wrote. */
  readonly unknownSends: number;
}

const done = (code: string): JobOutcome => ({ kind: 'done', code });

/**
 * Under the gate lock: the ledger's rules, then the recipient and the
 * subject read again. A recipient who is gone leaves no row (nothing to
 * keep about them); no usable address, or a mail the account no longer
 * bears out, is recorded as skipped. Only then is the key claimed.
 */
async function claim(tx: Tx, dedupeKey: string, data: Data, redriven: boolean) {
  await tx.mailLedger.lockGate();
  const decision = claimDecision({ row: await tx.mailLedger.get(dedupeKey), redriven });
  if (decision.kind === 'stop') return decision.outcome;
  const recipient = await tx.users.get(data.recipientId);
  if (!recipient) return done('skipped.recipient-gone');
  const about = await tx[SUBJECT_REPO[data.template]].get(data.subjectId);
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
  const { unknownSends, resend } = decision;
  await tx.mailLedger.claim({ dedupeKey, ...data, unknownSends });
  return { kind: 'send', to, about, resend, unknownSends } satisfies Claimed;
}

/** Pure; the only variable in any mail is the day a rejected requester may ask again. */
function render(template: TemplateName, about: Claimed['about'], origin: string) {
  if (template !== 'access.rejected') return renderMail(template, {}, origin);
  if (!('state' in about)) throw new Error('access.rejected is about a request');
  const retryFrom = instantToWallClock(cooldownEnd(about.decidedAt ?? about.createdAt)).date;
  return renderMail(template, { retryFrom }, origin);
}

/** How the ledger records the provider's answer, and what the queue does next. */
function outcomeOf(
  result: MailResult,
  claimed: Claimed,
): { settlement: Settlement; outcome: JobOutcome } {
  switch (result.kind) {
    case 'sent': {
      const code = claimed.resend ? 'resent' : 'sent';
      return {
        settlement: { state: 'sent', code, graphRequestId: result.requestId },
        outcome: done(code),
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
    case 'throttled':
    case 'not-sent':
    case 'auth':
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
  const claimed = await write((tx) => claim(tx, key, job.data, job.redriven));
  if (claimed.kind !== 'send') return claimed;
  const { subject, text } = render(job.data.template, claimed.about, appOrigin);
  const result = await mail.send({ to: claimed.to, subject, text, dedupeKey: key });
  const { settlement, outcome } = outcomeOf(result, claimed);
  await write((tx) => tx.mailLedger.settle(key, settlement));
  return outcome;
};
