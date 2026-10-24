import { describe, expect, it } from 'vitest';

import type { MailResult, OutgoingMail } from '@/application/ports';
import { createAppTokenSource } from '@/infra/oidc';
import { inTransactionScope } from '@/infra/system';

import { createFakeGraph, GRAPH_BASE } from '../../../test/support/graph/fake-graph';
import type { Answer, GraphRequest } from '../../../test/support/graph/fake-graph-api';
import {
  createTestIdp,
  TEST_CLIENT,
  TEST_ISSUER,
  TEST_SECRET,
} from '../../../test/support/oidc/test-idp';
import { FixedClock } from '../../../test/support/world/clock';
import { createGraphMail, createMailPort } from './index';

const MAILBOX = 'autoporada@ssps.cz';
const MAIL: OutgoingMail = {
  to: 'jana.novakova@ssps.cz',
  subject: 'Žádost o přístup byla schválena',
  text: 'Dobrý den,\nvaše žádost byla schválena.',
  dedupeKey: 'access.approved:3f2a',
};

async function setup(budgetMs?: number) {
  const idp = await createTestIdp();
  const clock = new FixedClock(new Date());
  const graph = createFakeGraph({ idp, mailbox: MAILBOX, clock });
  const requests: { url: string; init: GraphRequest }[] = [];
  const fetch = (url: string, init: GraphRequest) => {
    requests.push({ url, init });
    return graph.fetch(url, init);
  };
  const tokens = createAppTokenSource({
    provider: {
      ...{ issuer: TEST_ISSUER, clientId: TEST_CLIENT, appOrigin: 'https://autoporada.ssps.cz' },
      ...{ credential: { kind: 'secret', secret: TEST_SECRET }, domainHint: null },
      production: true,
      fetch: graph.fetch,
    },
    scope: 'https://graph.microsoft.com/.default',
    clock,
  });
  const parts = { baseUrl: GRAPH_BASE, mailbox: MAILBOX, tokens, fetch, clock };
  const mail = createGraphMail({ ...parts, ...(budgetMs && { budgetMs }) });
  return { idp, graph, requests, tokens, clock, mail };
}

describe('the Graph transport', () => {
  it('posts exactly the text message of ADR 0016 and keeps the request-id', async () => {
    const { graph, requests, mail } = await setup();
    const result = await mail.send(MAIL);
    expect(result).toEqual({ kind: 'sent', requestId: expect.stringMatching(/^[0-9a-f-]{36}$/) });
    const [request] = requests;
    expect(request?.url).toBe(`${GRAPH_BASE}/users/autoporada%40ssps.cz/sendMail`);
    expect(request?.init).toMatchObject({
      method: 'POST',
      headers: {
        authorization: expect.stringMatching(/^Bearer e30\./),
        'content-type': 'application/json',
      },
    });
    expect(JSON.parse(String(request?.init.body))).toEqual({
      message: {
        subject: MAIL.subject,
        body: { contentType: 'Text', content: MAIL.text },
        toRecipients: [{ emailAddress: { address: MAIL.to } }],
        internetMessageHeaders: [
          { name: 'X-Autoporada-Dedupe', value: MAIL.dedupeKey },
          { name: 'X-Auto-Response-Suppress', value: 'All' },
        ],
      },
      saveToSentItems: false,
    });
    expect(graph.sent).toHaveLength(1);
    expect(graph.seen).toEqual({
      calls: 1,
      callsInsideTransaction: 0,
      unscopedGrant: false,
      rejected: [],
    });
  });

  it.each<[string, Answer, MailResult]>([
    [
      '429 in seconds',
      { status: 429, retryAfter: '7' },
      { kind: 'throttled', retryAfterMs: 7_000, code: 'throttled.429' },
    ],
    [
      '503 without Retry-After',
      503,
      { kind: 'throttled', retryAfterMs: 30_000, code: 'throttled.503' },
    ],
    ['400', 400, { kind: 'rejected', code: 'rejected.400' }],
    ['500', 500, { kind: 'unknown', code: 'unknown.500' }],
    ['504', 504, { kind: 'unknown', code: 'unknown.504' }],
  ])('classifies %s', async (_, scripted, expected) => {
    const { graph, mail } = await setup();
    graph.script(scripted);
    expect(await mail.send(MAIL)).toEqual(expected);
    expect(graph.sent).toEqual([]);
  });

  it('reads a 429 HTTP-date against its clock', async () => {
    const { graph, clock, mail } = await setup();
    clock.set(new Date(Math.floor(clock.now().getTime() / 1000) * 1000));
    graph.script({
      status: 429,
      retryAfter: new Date(clock.now().getTime() + 60_000).toUTCString(),
    });
    expect(await mail.send(MAIL)).toMatchObject({ kind: 'throttled', retryAfterMs: 60_000 });
  });

  it('calls a reset after the write unknown, though Graph took the mail', async () => {
    const { graph, mail } = await setup();
    graph.acceptThenDrop();
    expect(await mail.send(MAIL)).toEqual({ kind: 'unknown', code: 'unknown.ECONNRESET' });
    expect(graph.sent).toHaveLength(1);
  });

  it('reads every 403 as auth, whatever its body, and keeps no body', async () => {
    const { graph, mail } = await setup();
    graph.script(
      {
        status: 403,
        body: { error: { code: 'ErrorAccessDenied', message: 'Denied for jana.novakova@ssps.cz' } },
      },
      { status: 403, body: { error: { code: 'ErrorSendAsDenied' } } },
      { status: 403, body: {} },
    );
    graph.outOfScope('nobody@ssps.cz');
    const results = [await mail.send(MAIL), await mail.send(MAIL), await mail.send(MAIL)];
    expect(results).toEqual(Array(3).fill({ kind: 'auth', code: 'auth.403' }));
    expect(JSON.stringify(results)).not.toMatch(/jana|Denied|ErrorSendAs/);
  });

  it('meets an RBAC scope without the mailbox with auth.403', async () => {
    const { graph, mail } = await setup();
    graph.outOfScope(MAILBOX);
    expect(await mail.send(MAIL)).toEqual({ kind: 'auth', code: 'auth.403' });
  });

  it('answers a 401 with one fresh token and one more call', async () => {
    const { idp, graph, mail } = await setup();
    graph.script(401);
    expect(await mail.send(MAIL)).toMatchObject({ kind: 'sent' });
    expect(idp.seen.tokenRequests).toHaveLength(2);
    expect(graph.seen.calls).toBe(2);
  });

  it('gives up after a second 401', async () => {
    const { graph, mail } = await setup();
    graph.script(401, 401);
    expect(await mail.send(MAIL)).toEqual({ kind: 'auth', code: 'auth.401' });
    expect(graph.seen.calls).toBe(2);
  });

  it('ends a hanging call at the budget as unknown', async () => {
    const { graph, mail } = await setup(50);
    graph.hang();
    expect(await mail.send(MAIL)).toEqual({ kind: 'unknown', code: 'unknown.timeout' });
  });

  it('spends the same budget on the token: a hanging Entra is not-sent', async () => {
    const { idp, graph, mail } = await setup(50);
    idp.failToken('timeout');
    expect(await mail.send(MAIL)).toEqual({ kind: 'not-sent', code: 'net.unavailable' });
    expect(graph.seen.calls).toBe(0);
  });

  it('classifies a refused credential as auth before any Graph call', async () => {
    const { idp, graph, mail } = await setup();
    idp.failToken({
      status: 401,
      body: { error: 'invalid_client', error_description: 'AADSTS7000215: x' },
    });
    expect(await mail.send(MAIL)).toEqual({ kind: 'auth', code: 'auth.token.AADSTS7000215' });
    expect(graph.seen.calls).toBe(0);
  });

  it('refuses to send inside a database transaction, before any request', async () => {
    const { idp, graph, mail } = await setup();
    await expect(inTransactionScope(() => mail.send(MAIL))).rejects.toThrow(
      /inside a database transaction/,
    );
    expect(idp.seen.tokenRequests).toHaveLength(0);
    expect(graph.seen.calls).toBe(0);
  });
});

describe('createMailPort', () => {
  it('builds the Graph transport from the configuration', async () => {
    const { graph, tokens, clock } = await setup();
    const port = createMailPort(
      {
        environment: 'production',
        graphBaseUrl: GRAPH_BASE,
        mail: { transport: 'graph', from: MAILBOX },
      },
      { tokens, fetch: graph.fetch, clock },
    );
    expect(await port.send(MAIL)).toMatchObject({ kind: 'sent' });
    expect(graph.sent[0]?.mailbox).toBe(MAILBOX);
  });

  it('refuses SMTP in production, and builds it elsewhere without connecting', async () => {
    const { graph, tokens, clock } = await setup();
    const smtp = { transport: 'smtp', from: MAILBOX, smtpUrl: 'smtp://127.0.0.1:1025' } as const;
    const parts = { tokens, fetch: graph.fetch, clock };
    const config = { environment: 'production', graphBaseUrl: GRAPH_BASE, mail: smtp } as const;
    expect(() => createMailPort(config, parts)).toThrow(
      'MAIL_TRANSPORT must be graph in production',
    );
    // The send itself is proved against Mailpit (test/integration/mail/smtp.test.ts).
    const port = createMailPort({ ...config, environment: 'development' }, parts);
    expect(port.send).toBeTypeOf('function');
    expect(graph.seen.calls).toBe(0);
  });
});
