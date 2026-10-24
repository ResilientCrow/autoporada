import type { Clock, MailPort, MailResult, OutgoingMail } from '@/application/ports';
import type { AppTokenSource } from '@/infra/oidc';
import { assertOutsideTransaction } from '@/infra/system';

import { classifyAnswer, classifyFailure } from './classify';

/** Token and Graph call together, under one combined signal (design §4). */
export const SEND_BUDGET_MS = 20_000;

/** The fetch the transport needs: the global one, or a test's in-process Graph. */
export type HttpFetch = (
  url: string,
  init: {
    readonly method: string;
    readonly headers: Readonly<Record<string, string>>;
    readonly body: string;
    readonly signal: AbortSignal;
  },
) => Promise<Response>;

/** Graph's sendMail body: text only, one recipient, x- headers, no copy in Sent Items (ADR 0016). */
const body = (mail: OutgoingMail) =>
  JSON.stringify({
    message: {
      subject: mail.subject,
      body: { contentType: 'Text', content: mail.text },
      toRecipients: [{ emailAddress: { address: mail.to } }],
      internetMessageHeaders: [
        { name: 'X-Autoporada-Dedupe', value: mail.dedupeKey },
        { name: 'X-Auto-Response-Suppress', value: 'All' },
      ],
    },
    saveToSentItems: false,
  });

/**
 * Microsoft Graph sendMail as the shared mailbox (the path names the sender,
 * so there is no `from`). One budget covers the token and the call; a 401 gets
 * one fresh token and one more call. Answers are classified by status: the
 * body is discarded, never read. Never throws for a provider outcome.
 */
export function createGraphMail(options: {
  readonly baseUrl: string;
  readonly mailbox: string;
  readonly tokens: AppTokenSource;
  readonly fetch?: HttpFetch;
  readonly clock: Clock;
  readonly budgetMs?: number;
}): MailPort {
  const { tokens, clock } = options;
  const fetch: HttpFetch = options.fetch ?? globalThis.fetch;
  const url = `${options.baseUrl}/users/${encodeURIComponent(options.mailbox)}/sendMail`;

  async function call(
    payload: string,
    signal: AbortSignal,
    refreshed: boolean,
  ): Promise<MailResult> {
    const token = await tokens.token(signal);
    const response = await fetch(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: payload,
      signal,
    });
    const { status, headers } = response;
    await response.body?.cancel();
    if (status === 401) tokens.invalidate();
    if (status === 401 && !refreshed) return call(payload, signal, true);
    const answer = {
      status,
      requestId: headers.get('request-id'),
      retryAfter: headers.get('retry-after'),
    };
    return classifyAnswer(answer, clock.now());
  }

  return {
    async send(mail) {
      assertOutsideTransaction('Graph sendMail');
      try {
        return await call(
          body(mail),
          AbortSignal.timeout(options.budgetMs ?? SEND_BUDGET_MS),
          false,
        );
      } catch (error) {
        return classifyFailure(error);
      }
    },
  };
}
