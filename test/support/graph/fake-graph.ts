/**
 * An in-process Microsoft Graph for the mail transport, next to the TestIdp:
 * one router serves both, so production code runs unchanged against the real
 * URLs. It checks what Graph checks of a sendMail call (the token, the RBAC
 * scope, the body), and refuses everything the Graph transport never sends. The people search
 * (`GET /users`) lives in fake-graph-users.ts.
 */
import { randomUUID } from 'node:crypto';

import type { CustomFetchOptions } from 'openid-client';
import { z } from 'zod';

import type { Clock } from '@/application/ports';
import { insideTransaction, systemClock } from '@/infra/system';

import type { TestIdp } from '../oidc/test-idp';
import { GRAPH_AUDIENCE, TEST_TENANT } from '../oidc/test-idp-api';
import {
  GRAPH_ORIGIN,
  type Answer,
  type GraphUser,
  type SearchMode,
  type FakeGraph,
  type GraphFetch,
  type GraphRequest,
  type SentMail,
} from './fake-graph-api';
import { searchUsers } from './fake-graph-users';

export { GRAPH_BASE, GRAPH_USERS } from './fake-graph-api';

const ENTRA_ORIGIN = 'https://login.microsoftonline.com';
const USERS_PATH = '/v1.0/users';
const SEND_MAIL = /^\/v1\.0\/users\/([^/]+)\/sendMail$/;
const ERROR_CODES: Readonly<Record<number, string>> = {
  400: 'ErrorInvalidRequest',
  401: 'InvalidAuthenticationToken',
  403: 'ErrorAccessDenied',
  404: 'ResourceNotFound',
  405: 'MethodNotAllowed',
  415: 'UnsupportedMediaType',
  429: 'TooManyRequests',
  500: 'InternalServerError',
  503: 'ServiceUnavailable',
  504: 'GatewayTimeout',
};

/** One plain ASCII address, as the transport hands Graph. */
const recipient = z.strictObject({
  emailAddress: z.strictObject({ address: z.string().regex(/^[!-?A-~]+@[A-Za-z0-9.-]+$/) }),
});
/** Exactly the body of design §4: text only, one recipient, x- headers, no Sent Items copy. */
const SendMail = z.strictObject({
  message: z.strictObject({
    subject: z.string().min(1),
    body: z.strictObject({ contentType: z.literal('Text'), content: z.string() }),
    toRecipients: z.tuple([recipient]),
    internetMessageHeaders: z
      .array(z.strictObject({ name: z.string().regex(/^x-/i), value: z.string() }))
      .optional(),
    from: recipient.optional(),
  }),
  saveToSentItems: z.literal(false),
});

const answer = (status: number, headers: Record<string, string> = {}, body?: object) =>
  new Response(
    status === 202
      ? null
      : JSON.stringify(
          body ?? { error: { code: ERROR_CODES[status] ?? 'Error', message: 'fake' } },
        ),
    {
      status,
      headers: {
        'request-id': randomUUID(),
        ...(status !== 202 && { 'content-type': 'application/json' }),
        ...headers,
      },
    },
  );

const claimsOf = (token: string): Record<string, unknown> => {
  const payload: unknown = JSON.parse(
    Buffer.from(token.split('.')[1] ?? '', 'base64url').toString(),
  );
  return typeof payload === 'object' && payload !== null ? { ...payload } : {};
};

const never = (signal: AbortSignal | null | undefined) =>
  new Promise<Response>((_, reject) => {
    if (signal?.aborted) reject(signal.reason);
    signal?.addEventListener('abort', () => reject(signal.reason));
  });

export function createFakeGraph(options: {
  readonly idp: TestIdp;
  readonly mailbox: string;
  readonly clock?: Clock;
  /** What `GET /users` searches; none by default. */
  readonly users?: readonly GraphUser[];
  readonly search?: SearchMode;
}): FakeGraph {
  const { idp, mailbox } = options;
  const clock = options.clock ?? systemClock;
  const sent: SentMail[] = [];
  const steps: (Answer | 'drop' | 'hang')[] = [];
  const outside = new Set<string>();
  let pending = 0;
  const seen: FakeGraph['seen'] = {
    calls: 0,
    callsInsideTransaction: 0,
    unscopedGrant: false,
    searches: [],
    rejected: [],
  };
  const refuse = (status: number, reason: string, code?: string) => {
    seen.rejected.push(reason);
    return answer(status, {}, code ? { error: { code, message: 'fake' } } : undefined);
  };

  /**
   * The next scripted step for a call that passed the checks. No step, or a 202, is the normal
   * answer: `accept` records it, and the response is the 202 of sendMail or the 200 of a search.
   */
  function play(
    init: GraphRequest,
    accept: () => void,
    body?: object,
  ): Response | Promise<Response> {
    const step = steps.shift();
    if (step === 'hang') return never(init.signal);
    if (step === 'drop') {
      accept();
      const reset = Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' });
      throw new TypeError('fetch failed', { cause: reset });
    }
    const scripted = typeof step === 'number' ? { status: step } : (step ?? { status: 202 });
    if (scripted.status === 202) accept();
    const { retryAfter } = scripted;
    const headers: Record<string, string> = retryAfter ? { 'retry-after': retryAfter } : {};
    if (scripted.status === 202 && body) return answer(200, headers, body);
    return answer(scripted.status, headers, scripted.body);
  }

  /** Graph's token checks: issued by the IdP for Graph, this tenant, unexpired. */
  function tokenProblem(authorization: string | null): string | Record<string, unknown> {
    const token = /^Bearer (\S+)$/.exec(authorization ?? '')?.[1];
    if (!token) return 'token.missing';
    if (!idp.seen.appTokens.has(token)) return 'token.foreign';
    const claims = claimsOf(token);
    if (claims['aud'] !== GRAPH_AUDIENCE) return 'token.audience';
    if (claims['tid'] !== TEST_TENANT) return 'token.tenant';
    const exp = claims['exp'];
    if (typeof exp !== 'number' || exp * 1000 <= clock.now().getTime()) return 'token.expired';
    return claims;
  }

  /** Exchange's RBAC scope, in union with Entra's grants (an Entra Mail.Send covers every mailbox). */
  function rbacProblem(claims: Record<string, unknown>, target: string): string | undefined {
    const roles = claims['roles'];
    if (Array.isArray(roles) && roles.includes('Mail.Send')) {
      seen.unscopedGrant = true;
      return undefined;
    }
    if (target.toLowerCase() !== mailbox.toLowerCase() || outside.has(target.toLowerCase())) {
      return 'rbac.scope';
    }
    if (pending > 0) {
      pending--;
      return 'rbac.pending';
    }
    return undefined;
  }

  async function sendMail(url: URL, init: GraphRequest): Promise<Response> {
    seen.calls++;
    if (insideTransaction()) seen.callsInsideTransaction++;
    const route = SEND_MAIL.exec(url.pathname);
    if (!route?.[1]) return refuse(404, 'route');
    if (init.method !== 'POST') return refuse(405, 'method');
    const target = decodeURIComponent(route[1]);
    const headers = new Headers(init.headers);
    const claims = tokenProblem(headers.get('authorization'));
    if (typeof claims === 'string') return refuse(401, claims);
    const rbac = rbacProblem(claims, target);
    if (rbac) return refuse(403, rbac);
    if (!/^application\/json(;|$)/i.test(headers.get('content-type') ?? '')) {
      return refuse(415, 'content-type');
    }
    let json: unknown;
    try {
      json = JSON.parse(typeof init.body === 'string' ? init.body : '');
    } catch {
      return refuse(400, 'body.json');
    }
    const parsed = SendMail.safeParse(json);
    if (!parsed.success) return refuse(400, `body.${parsed.error.issues[0]?.path.join('.') ?? ''}`);
    const { message } = parsed.data;
    const from = message.from?.emailAddress.address;
    if (from !== undefined && from.toLowerCase() !== target.toLowerCase()) {
      return refuse(400, 'body.from');
    }
    const mail: SentMail = {
      mailbox: target,
      subject: message.subject,
      text: message.body.content,
      to: message.toRecipients[0].emailAddress.address,
      headers: Object.fromEntries(
        (message.internetMessageHeaders ?? []).map((h) => [h.name, h.value]),
      ),
    };

    return play(init, () => sent.push(mail));
  }

  const search = (url: URL, init: GraphRequest) =>
    searchUsers(
      {
        users: options.users ?? [],
        mode: options.search ?? 'readbasic-ok',
        searches: seen.searches,
        refuse,
        tokenProblem,
        play: (request, body) => play(request, () => undefined, body),
      },
      url,
      init,
    );

  const fetch: GraphFetch = async (url, init) => {
    const parsed = new URL(url);
    // openid-client's own requests: the init it built is a CustomFetchOptions.
    if (parsed.origin === ENTRA_ORIGIN) return idp.fetch(url, init as CustomFetchOptions);
    if (parsed.origin === GRAPH_ORIGIN) {
      return parsed.pathname === USERS_PATH ? search(parsed, init) : sendMail(parsed, init);
    }
    throw new TypeError('fetch failed');
  };

  return {
    fetch,
    sent,
    script: (...answers) => void steps.push(...answers),
    acceptThenDrop: () => void steps.push('drop'),
    hang: () => void steps.push('hang'),
    outOfScope: (address) => void outside.add(address.toLowerCase()),
    rbacPendingFor(calls) {
      pending = calls;
    },
    seen,
  };
}
