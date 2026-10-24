import { describe, expect, it } from 'vitest';

import { createAppTokenSource } from '@/infra/oidc';
import { inTransactionScope } from '@/infra/system';

import { createTestIdp, TEST_CLIENT, TEST_ISSUER, TEST_SECRET } from '../oidc/test-idp';
import { FixedClock } from '../world/clock';
import { createFakeGraph, GRAPH_BASE } from './fake-graph';

const MAILBOX = 'autoporada@ssps.cz';
const MAIL = {
  message: {
    subject: 'Žádost o přístup byla schválena',
    body: { contentType: 'Text', content: 'Dobrý den,\nvaše žádost byla schválena.' },
    toRecipients: [{ emailAddress: { address: 'jana.novakova@ssps.cz' } }],
    internetMessageHeaders: [
      { name: 'X-Autoporada-Dedupe', value: 'access.approved:1' },
      { name: 'X-Auto-Response-Suppress', value: 'All' },
    ],
  },
  saveToSentItems: false,
};
type Mail = typeof MAIL & Record<string, unknown>;

async function setup() {
  const idp = await createTestIdp();
  // The TestIdp stamps `exp` from the wall clock; the fake checks it against this one.
  const clock = new FixedClock(new Date());
  const graph = createFakeGraph({ idp, mailbox: MAILBOX, clock });
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
  const bearer = async () => `Bearer ${await tokens.token(new AbortController().signal)}`;
  const send = async (
    body: object | string = MAIL,
    over: { mailbox?: string; method?: string; headers?: Record<string, string> } = {},
  ) =>
    graph.fetch(`${GRAPH_BASE}/users/${encodeURIComponent(over.mailbox ?? MAILBOX)}/sendMail`, {
      method: over.method ?? 'POST',
      headers: {
        authorization: await bearer(),
        'content-type': 'application/json',
        ...over.headers,
      },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });
  return { idp, clock, graph, tokens, send };
}

const edited = (edit: (mail: Mail) => unknown): Mail => {
  const mail = structuredClone(MAIL) as Mail;
  edit(mail);
  return mail;
};

describe('the fake Graph', () => {
  it('accepts the transport’s message with an empty 202 and a request-id', async () => {
    const { graph, send } = await setup();
    const response = await send();
    expect(response.status).toBe(202);
    expect(await response.text()).toBe('');
    expect(response.headers.get('request-id')).toMatch(/^[0-9a-f-]{36}$/);
    expect(graph.sent).toEqual([
      {
        mailbox: MAILBOX,
        subject: MAIL.message.subject,
        text: MAIL.message.body.content,
        to: 'jana.novakova@ssps.cz',
        headers: { 'X-Autoporada-Dedupe': 'access.approved:1', 'X-Auto-Response-Suppress': 'All' },
      },
    ]);
    expect(graph.seen).toMatchObject({ calls: 1, unscopedGrant: false, rejected: [] });
  });

  const forged = `e30.${Buffer.from(
    JSON.stringify({
      aud: 'https://graph.microsoft.com',
      tid: '00000000-0000-0000-0000-000000000001',
      exp: 4e9,
    }),
  ).toString('base64url')}.`;
  it.each([
    ['no token', { authorization: '' }, {}, 'token.missing'],
    ['another scheme', { authorization: 'Basic eDp5' }, {}, 'token.missing'],
    ['a token the IdP never issued', { authorization: `Bearer ${forged}` }, {}, 'token.foreign'],
    ['another audience', {}, { aud: 'https://outlook.office.com' }, 'token.audience'],
    ['another tenant', {}, { tid: '99999999-9999-4999-8999-999999999999' }, 'token.tenant'],
  ])('refuses %s with 401', async (_, headers, claims, reason) => {
    const { idp, graph, send } = await setup();
    idp.appTokenClaims(claims);
    const response = await send(MAIL, { headers });
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { code: 'InvalidAuthenticationToken' } });
    expect(graph.seen.rejected).toEqual([reason]);
    expect(graph.sent).toEqual([]);
  });

  it('refuses an expired token', async () => {
    const { clock, graph, send } = await setup();
    clock.advance(3_600_000);
    expect((await send()).status).toBe(401);
    expect(graph.seen.rejected).toEqual(['token.expired']);
  });

  const R = 'body.message.toRecipients';
  it.each<[string, string, (m: Mail) => unknown]>([
    ['saveToSentItems true', 'body.saveToSentItems', (m) => (m.saveToSentItems = true as false)],
    [
      'no saveToSentItems',
      'body.saveToSentItems',
      (m) => delete (m as Partial<Mail>).saveToSentItems,
    ],
    ['an HTML body', 'body.message.body.contentType', (m) => (m.message.body.contentType = 'HTML')],
    ['two recipients', R, (m) => m.message.toRecipients.push(m.message.toRecipients[0]!)],
    ['no recipient', R, (m) => (m.message.toRecipients = [])],
    [
      'a non-ASCII recipient',
      `${R}.0.emailAddress.address`,
      (m) => (m.message.toRecipients[0]!.emailAddress.address = 'jána@ssps.cz'),
    ],
    [
      'a header without x-',
      'body.message.internetMessageHeaders.0.name',
      (m) => (m.message.internetMessageHeaders[0]!.name = 'Auto-Submitted'),
    ],
    [
      'a from of another mailbox',
      'body.from',
      (m) => Object.assign(m.message, { from: { emailAddress: { address: 'reditel@ssps.cz' } } }),
    ],
    [
      'a field the transport never sends',
      'body.message',
      (m) => Object.assign(m.message, { ccRecipients: [] }),
    ],
    ['an empty subject', 'body.message.subject', (m) => (m.message.subject = '')],
  ])('refuses %s with 400', async (_, reason, edit) => {
    const { graph, send } = await setup();
    const response = await send(edited(edit));
    expect(response.status).toBe(400);
    expect(graph.seen.rejected).toEqual([reason]);
    expect(graph.sent).toEqual([]);
  });

  it('refuses a body that is not JSON, and another content type', async () => {
    const { graph, send } = await setup();
    expect((await send('{"message":')).status).toBe(400);
    expect((await send(MAIL, { headers: { 'content-type': 'text/plain' } })).status).toBe(415);
    expect((await send(MAIL, { method: 'GET' })).status).toBe(405);
    expect(graph.seen.rejected).toEqual(['body.json', 'content-type', 'method']);
  });

  it('accepts x- headers in any case and a from equal to the mailbox', async () => {
    const { graph, send } = await setup();
    const mail = edited((m) => {
      m.message.internetMessageHeaders[0]!.name = 'x-autoporada-dedupe';
      Object.assign(m.message, { from: { emailAddress: { address: 'Autoporada@ssps.cz' } } });
    });
    expect((await send(mail)).status).toBe(202);
    expect(graph.sent).toHaveLength(1);
  });

  it('keeps the app to its RBAC scope: another mailbox, out of scope, still propagating', async () => {
    const { graph, send } = await setup();
    expect((await send(MAIL, { mailbox: 'reditel@ssps.cz' })).status).toBe(403);
    graph.rbacPendingFor(2);
    const pending = [await send(), await send(), await send()].map((r) => r.status);
    expect(pending).toEqual([403, 403, 202]);
    graph.outOfScope(MAILBOX);
    const out = await send();
    expect(out.status).toBe(403);
    expect(await out.json()).toMatchObject({ error: { code: 'ErrorAccessDenied' } });
    expect((await send()).status).toBe(403);
    expect(graph.seen.rejected).toEqual([
      'rbac.scope',
      'rbac.pending',
      'rbac.pending',
      'rbac.scope',
      'rbac.scope',
    ]);
    expect(graph.seen.unscopedGrant).toBe(false);
  });

  it('lets Mail.Send granted in Entra cover every mailbox, and says so', async () => {
    const { idp, graph, send } = await setup();
    idp.grantRoles(['Mail.Send']);
    graph.outOfScope(MAILBOX);
    expect((await send(MAIL, { mailbox: 'reditel@ssps.cz' })).status).toBe(202);
    expect(graph.seen.unscopedGrant).toBe(true);
  });

  it('answers as scripted, once each, then normally', async () => {
    const { graph, send } = await setup();
    const date = 'Sat, 24 Oct 2026 08:00:07 GMT';
    const odd403 = { error: { code: 'ErrorSendAsDenied', message: 'x' } };
    graph.script(
      { status: 429, retryAfter: '7' },
      { status: 429, retryAfter: date },
      503,
      401,
      { status: 403, body: odd403 },
      400,
      500,
      504,
      202,
    );
    const answers = [];
    for (let i = 0; i < 10; i++) answers.push(await send());
    expect(answers.map((r) => r.status)).toEqual([
      429, 429, 503, 401, 403, 400, 500, 504, 202, 202,
    ]);
    expect(answers.map((r) => r.headers.get('retry-after')).slice(0, 3)).toEqual(['7', date, null]);
    expect(await answers[0]!.json()).toMatchObject({ error: { code: 'TooManyRequests' } });
    expect(await answers[4]!.json()).toEqual(odd403);
    expect(answers.every((r) => r.headers.get('request-id'))).toBe(true);
    expect(graph.sent).toHaveLength(2);
    expect(graph.seen.rejected).toEqual([]);
  });

  it('accepts, then drops the connection', async () => {
    const { graph, send } = await setup();
    graph.acceptThenDrop();
    const error: unknown = await send().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TypeError);
    expect(error).toMatchObject({ message: 'fetch failed', cause: { code: 'ECONNRESET' } });
    expect(graph.sent).toHaveLength(1);
  });

  it('hangs until the caller aborts', async () => {
    const { graph, tokens } = await setup();
    const authorization = `Bearer ${await tokens.token(new AbortController().signal)}`;
    graph.hang();
    const stop = new AbortController();
    const call = graph.fetch(`${GRAPH_BASE}/users/${MAILBOX}/sendMail`, {
      method: 'POST',
      headers: { authorization, 'content-type': 'application/json' },
      body: JSON.stringify(MAIL),
      signal: stop.signal,
    });
    stop.abort();
    await expect(call).rejects.toMatchObject({ name: 'AbortError' });
    expect(graph.sent).toEqual([]);
  });

  it('counts calls made inside a transaction, and reaches no other host', async () => {
    const { graph, send } = await setup();
    await send();
    const call = { method: 'POST', headers: { authorization: 'Bearer x' } };
    await inTransactionScope(() => graph.fetch(`${GRAPH_BASE}/users/${MAILBOX}/sendMail`, call));
    expect(graph.seen).toMatchObject({ calls: 2, callsInsideTransaction: 1 });
    await expect(graph.fetch('https://example.org/', {})).rejects.toThrow(TypeError);
  });
});
