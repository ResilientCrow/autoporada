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
  /** One-shot answers for the next calls, in order. */
  script(...results: readonly MailResult[]): void;
} {
  const calls: Call[] = [];
  const answers: MailResult[] = [];
  return {
    calls,
    script: (...results) => void answers.push(...results),
    async send(mail) {
      calls.push({ mail, insideTransaction: insideTransaction() });
      return answers.shift() ?? { kind: 'sent', requestId: `request-${calls.length}` };
    },
  };
}
