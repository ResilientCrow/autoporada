import type { MailPort, MailResult, OutgoingMail } from '@/application/ports';
import { insideTransaction } from '@/infra/system';

interface Call {
  readonly mail: OutgoingMail;
  /** Whether the call ran inside a database transaction's work: never allowed (ADR 0016). */
  readonly insideTransaction: boolean;
}

/** A mail transport that answers from a script (default: accepted) and records every call. */
export function createFakeMail(): MailPort & {
  readonly calls: readonly Call[];
  /**
   * One-shot answers for the next calls, in order. An Error is thrown after
   * the call is recorded: the worker died once the provider had the mail.
   */
  script(...results: readonly (MailResult | Error)[]): void;
} {
  const calls: Call[] = [];
  const answers: (MailResult | Error)[] = [];
  return {
    calls,
    script: (...results) => void answers.push(...results),
    async send(mail) {
      calls.push({ mail, insideTransaction: insideTransaction() });
      const answer = answers.shift() ?? { kind: 'sent', requestId: `request-${calls.length}` };
      if (answer instanceof Error) throw answer;
      return answer;
    },
  };
}
