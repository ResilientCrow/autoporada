import { getSystemErrorName } from 'node:util';

import type { Transporter } from 'nodemailer';

import type { Clock, MailPort, MailResult } from '@/application/ports';
import { assertOutsideTransaction, systemClock } from '@/infra/system';

import { SEND_BUDGET_MS } from './graph';
import { retryAfterMs } from './retry-after';

/** Only plain ASCII addresses reach nodemailer's address parser (its advisories live there). */
const PLAIN_ADDRESS = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+$/;
const HEADER_VALUE = /^[!-~]{1,200}$/;
const ERRNO = /^E[A-Z0-9_]{1,30}$/;

/** What nodemailer's errors carry, read defensively: never the message. */
function classify(error: unknown, now: Date): MailResult {
  if (!(error instanceof Error)) return { kind: 'unknown', code: 'unknown.error' };
  // Its own fields (code, responseCode, errno, syscall); the message is not enumerable.
  const fields: { readonly [field: string]: unknown } = { ...error };
  const reply = typeof fields['responseCode'] === 'number' ? fields['responseCode'] : undefined;
  // A 4xx or 5xx reply means the server did not take the message, whatever the command.
  if (reply !== undefined && reply >= 400 && reply < 500) {
    return { kind: 'throttled', retryAfterMs: retryAfterMs(null, now), code: `throttled.${reply}` };
  }
  if (reply !== undefined && reply >= 500 && reply < 600) {
    return { kind: 'rejected', code: `rejected.${reply}` };
  }
  // Refused or unresolvable, before a session existed: nothing was sent.
  // Node names an unknown host EAI_NONAME; fetch (and so the Graph side) says ENOTFOUND.
  if (fields['syscall'] === 'connect' || fields['syscall'] === 'getaddrinfo') {
    const name = typeof fields['errno'] === 'number' ? getSystemErrorName(fields['errno']) : '';
    const errno = name === 'EAI_NONAME' || name === 'EAI_NODATA' ? 'ENOTFOUND' : name;
    if (ERRNO.test(errno)) return { kind: 'not-sent', code: `net.${errno}` };
  }
  // nodemailer reports every timeout, after the data too, as ETIMEDOUT at CONN: maybe sent.
  if (fields['code'] === 'ETIMEDOUT') return { kind: 'unknown', code: 'unknown.timeout' };
  const code =
    typeof fields['code'] === 'string' && ERRNO.test(fields['code']) ? fields['code'] : 'error';
  return { kind: 'unknown', code: `unknown.${code}` };
}

/**
 * Plain SMTP to Mailpit, for development and tests only: the configuration
 * refuses it in production, and nodemailer (a devDependency) is loaded only
 * here, on the first send. No file or URL access, no DKIM or OAuth2;
 * recipients as validated `{ address }` objects. Never throws for a provider outcome.
 */
export function createSmtpMail(options: {
  readonly url: string;
  readonly from: string;
  readonly clock?: Clock;
  readonly budgetMs?: number;
}): MailPort {
  const clock = options.clock ?? systemClock;
  const budget = options.budgetMs ?? SEND_BUDGET_MS;
  let transport: Promise<Transporter> | undefined;
  const transporter = () => {
    transport ??= import('nodemailer').then((nodemailer) =>
      nodemailer.createTransport({
        url: options.url,
        disableFileAccess: true,
        disableUrlAccess: true,
        connectionTimeout: budget,
        greetingTimeout: budget,
        socketTimeout: budget,
      }),
    );
    return transport;
  };

  return {
    async send(mail) {
      assertOutsideTransaction('SMTP send');
      if (!PLAIN_ADDRESS.test(mail.to)) return { kind: 'rejected', code: 'rejected.address' };
      if (!HEADER_VALUE.test(mail.dedupeKey)) return { kind: 'rejected', code: 'rejected.header' };
      try {
        await (
          await transporter()
        ).sendMail({
          from: { name: '', address: options.from },
          to: [{ name: '', address: mail.to }],
          subject: mail.subject,
          text: mail.text,
          textEncoding: 'quoted-printable',
          date: clock.now(),
          headers: {
            'Auto-Submitted': 'auto-generated',
            'X-Auto-Response-Suppress': 'All',
            'X-Autoporada-Dedupe': mail.dedupeKey,
          },
        });
        return { kind: 'sent', requestId: null };
      } catch (error) {
        return classify(error, clock.now());
      }
    },
  };
}
