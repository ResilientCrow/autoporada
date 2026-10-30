import { describe, expect, it, vi } from 'vitest';

import { createAppTokenSource } from '@/infra/oidc';
import { inTransactionScope } from '@/infra/system';

import { createTestIdp, TEST_CLIENT, TEST_ISSUER, TEST_SECRET } from '../oidc/test-idp';
import { FixedClock } from '../world/clock';
import { createFakeGraph, GRAPH_BASE, GRAPH_USERS } from './fake-graph';
import type { GraphUser } from './fake-graph-api';

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

async function setup(
  extra: { users?: readonly GraphUser[]; search?: 'readbasic-ok' | 'needs-user-read-all' } = {},
) {
  const idp = await createTestIdp();
  // The TestIdp stamps `exp` from the wall clock; the fake checks it against this one.
  const clock = new FixedClock(new Date());
  const graph = createFakeGraph({ idp, mailbox: MAILBOX, clock, ...extra });
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
  /** A user search the way the adapter will send it; `query` overrides single parameters, null drops one. */
  const find = async (
    query: Record<string, string | null> = {},
    over: {
      method?: string;
      headers?: Record<string, string>;
      path?: string;
      signal?: AbortSignal;
    } = {},
  ) => {
    const params = new URLSearchParams();
    const all: Record<string, string | null> = {
      $search: '"displayName:Novák"',
      $select: 'id,displayName,givenName,surname,mail,userPrincipalName',
      $top: '15',
      $count: 'true',
      ...query,
    };
    for (const [name, value] of Object.entries(all)) if (value !== null) params.set(name, value);
    return graph.fetch(`${GRAPH_BASE}${over.path ?? '/users'}?${params.toString()}`, {
      method: over.method ?? 'GET',
      headers: { authorization: await bearer(), consistencylevel: 'eventual', ...over.headers },
      signal: over.signal,
    });
  };
  return { idp, clock, graph, tokens, send, find, bearer };
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

describe('the fake Graph search', () => {
  const names = async (response: Response): Promise<string[]> =>
    ((await response.json()) as { value: { displayName: string }[] }).value.map(
      (u) => u.displayName,
    );
  const SEARCHES = ['Jana Nováková', 'Petr Novák'];

  it('finds by the start of a word, case-insensitively and without folding diacritics', async () => {
    const { graph, find } = await setup({ users: GRAPH_USERS });
    const response = await find({ $select: 'id,displayName' });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toMatch(/^application\/json/);
    expect(response.headers.get('request-id')).toMatch(/^[0-9a-f-]{36}$/);
    const body: unknown = await response.json();
    expect(body).toEqual({
      '@odata.count': 2,
      value: [
        { id: GRAPH_USERS[0]!.id, displayName: SEARCHES[0] },
        { id: GRAPH_USERS[1]!.id, displayName: SEARCHES[1] },
      ],
    });
    expect(await names(await find({ $search: '"displayName:NOVÁK"' }))).toEqual(SEARCHES);
    expect(await names(await find({ $search: '"displayName:nov"' }))).toEqual(SEARCHES);
    expect(await names(await find({ $search: '"surname:Nováková"' }))).toEqual([SEARCHES[0]]);
    expect(await names(await find({ $search: '"displayName:Králová"' }))).toEqual([
      'Eva Svobodová-Králová',
    ]);
    // Only the start of a word counts: „ovák“ is inside „Novák“.
    expect(await names(await find({ $search: '"displayName:ovák"' }))).toEqual([]);
    // Graph's own folding is open (S9): the fake does not fold, so the adapter must not rely on it.
    const folded = await find({ $search: '"displayName:novak"' });
    expect(await folded.json()).toEqual({ '@odata.count': 0, value: [] });
    expect(graph.seen.searches[0]).toBe('"displayName:Novák"');
    expect(graph.seen.searches).toHaveLength(7);
  });

  it('combines clauses with OR and AND, answers selected properties only, caps at $top', async () => {
    const { find } = await setup({ users: GRAPH_USERS });
    const either = '"givenName:Jana" OR "surname:Černá"';
    expect(await names(await find({ $search: either }))).toEqual(['Jana Nováková', 'Šárka Černá']);
    const both = '"givenName:Jana" AND "surname:Černá"';
    expect(await names(await find({ $search: both }))).toEqual([]);
    expect(await names(await find({ $search: '"givenName:Jana" AND "mail:jana"' }))).toEqual([
      'Jana Nováková',
    ]);
    const top = await (await find({ $top: '1' })).json();
    expect(top).toMatchObject({ '@odata.count': 2, value: [{ displayName: 'Jana Nováková' }] });
    const bare = await (await find({ $count: null, $select: 'surname,id' })).json();
    expect(bare).toEqual({
      value: [
        { surname: 'Nováková', id: GRAPH_USERS[0]!.id },
        { surname: 'Novák', id: GRAPH_USERS[1]!.id },
      ],
    });
    const all = await (await find({ $select: null })).json();
    expect(Object.keys((all as { value: object[] }).value[0]!).sort()).toEqual([
      'displayName',
      'givenName',
      'id',
      'mail',
      'surname',
      'userPrincipalName',
    ]);
  });

  it('hands back the guest, the room and the shared mailbox: filtering is the adapter’s job', async () => {
    const { find } = await setup({ users: GRAPH_USERS });
    const guest = await (await find({ $search: '"userPrincipalName:jan.hostujici"' })).json();
    expect(guest).toMatchObject({
      value: [{ userPrincipalName: expect.stringContaining('#EXT#') }],
    });
    const room = await (await find({ $search: '"displayName:Učebna"' })).json();
    expect(room).toMatchObject({ value: [{ givenName: null, surname: null }] });
    const shared = await (await find({ $search: '"mail:podatelna"' })).json();
    expect(shared).toMatchObject({
      value: [{ displayName: 'Podatelna', givenName: 'Podatelna', surname: null }],
    });
  });

  it.each([
    ['no ConsistencyLevel', { consistencylevel: '' }],
    ['another ConsistencyLevel', { consistencylevel: 'strong' }],
  ])('refuses %s with 400, and takes the header name in any case', async (_, headers) => {
    const { graph, find, bearer } = await setup({ users: GRAPH_USERS });
    const response = await find({}, { headers });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: 'Request_UnsupportedQuery' } });
    expect(graph.seen.rejected).toEqual(['search.consistency']);
    expect(graph.seen.searches).toEqual([]);
    const url = `${GRAPH_BASE}/users?${new URLSearchParams({ $search: '"surname:Nov"' })}`;
    const mixed = { authorization: await bearer(), ConsistencyLevel: 'eventual' };
    expect((await graph.fetch(url, { method: 'GET', headers: mixed })).status).toBe(200);
  });

  it('wants ConsistencyLevel for $count as well, before it looks at $search', async () => {
    const { graph, find } = await setup({ users: GRAPH_USERS });
    const response = await find({ $search: null }, { headers: { consistencylevel: '' } });
    expect(response.status).toBe(400);
    expect(graph.seen.rejected).toEqual(['search.consistency']);
  });

  it.each([
    ['no $search', null],
    ['an unquoted clause', 'displayName:Novák'],
    ['an unknown property', '"department:Novák"'],
    ['a clause without a value', '"displayName:"'],
    ['a clause without a property', '"Novák"'],
    ['a joiner that is not OR or AND', '"surname:a" XOR "surname:b"'],
    ['a quote inside a value', '"displayName:No"vák"'],
    ['a backslash inside a value', '"displayName:No\\vák"'],
    ['a trailing joiner', '"surname:a" OR'],
    ['a $count that is no boolean', 'COUNT'],
  ])('refuses %s with 400', async (_, search) => {
    const { graph, find } = await setup({ users: GRAPH_USERS });
    const response =
      search === 'COUNT' ? await find({ $count: 'maybe' }) : await find({ $search: search });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: 'Request_UnsupportedQuery' } });
    expect(graph.seen.rejected).toEqual(['search.syntax']);
    expect(graph.seen.searches).toEqual([]);
  });

  it('fails an ampersand in a value, however it was encoded', async () => {
    const { graph, find, bearer } = await setup({ users: GRAPH_USERS });
    const response = await find({ $search: '"displayName:Novák & Novák"' });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: 'Request_UnsupportedQuery' } });
    expect(graph.seen.rejected).toEqual(['search.ampersand']);
    // Unencoded, the & ends the parameter: what is left is no clause.
    const raw = await graph.fetch(`${GRAPH_BASE}/users?$search="displayName:a&b"&$top=1`, {
      method: 'GET',
      headers: { authorization: await bearer(), consistencylevel: 'eventual' },
    });
    expect(raw.status).toBe(400);
    expect(graph.seen.rejected).toEqual(['search.ampersand', 'search.syntax']);
  });

  it('refuses $filter: 403 for ReadBasic, 400 for User.Read.All (the fake has no $filter)', async () => {
    const basic = await setup({ users: GRAPH_USERS });
    const refused = await basic.find({ $filter: "startswith(surname,'Nov')" });
    expect(refused.status).toBe(403);
    expect(await refused.json()).toMatchObject({ error: { code: 'Authorization_RequestDenied' } });
    expect(basic.graph.seen.rejected).toEqual(['search.filter']);

    const full = await setup({ users: GRAPH_USERS });
    full.idp.grantRoles(['User.Read.All']);
    const unsupported = await full.find({ $filter: "startswith(surname,'Nov')" });
    expect(unsupported.status).toBe(400);
    expect(await unsupported.json()).toMatchObject({ error: { code: 'Request_UnsupportedQuery' } });
    expect(full.graph.seen.rejected).toEqual(['search.filter']);
  });

  it('answers ReadBasic by the mode: readbasic-ok accepts, needs-user-read-all refuses', async () => {
    const ok = await setup({ users: GRAPH_USERS, search: 'readbasic-ok' });
    expect((await ok.find()).status).toBe(200);

    const strict = await setup({ users: GRAPH_USERS, search: 'needs-user-read-all' });
    const denied = await strict.find();
    expect(denied.status).toBe(403);
    expect(await denied.json()).toMatchObject({ error: { code: 'Authorization_RequestDenied' } });
    expect(strict.graph.seen.rejected).toEqual(['search.role']);
    expect(strict.graph.seen.searches).toEqual([]);

    const full = await setup({ users: GRAPH_USERS, search: 'needs-user-read-all' });
    full.idp.grantRoles(['User.Read.All']);
    expect((await full.find()).status).toBe(200);
    const both = await setup({ users: GRAPH_USERS });
    both.idp.grantRoles(['User.Read.All']);
    expect((await both.find()).status).toBe(200);
  });

  it('refuses a token with neither user role', async () => {
    const { idp, graph, find } = await setup({ users: GRAPH_USERS });
    idp.grantRoles(['Mail.Send']);
    const response = await find();
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: 'Authorization_RequestDenied' } });
    expect(graph.seen.rejected).toEqual(['search.role']);
  });

  it('runs the mail route’s token checks: foreign, wrong audience and expired are 401', async () => {
    const forged = `e30.${Buffer.from(JSON.stringify({ aud: 'https://graph.microsoft.com', tid: '00000000-0000-0000-0000-000000000001', exp: 4e9, roles: ['User.Read.All'] })).toString('base64url')}.`;
    const a = await setup({ users: GRAPH_USERS });
    expect((await a.find({}, { headers: { authorization: `Bearer ${forged}` } })).status).toBe(401);
    expect((await a.find({}, { headers: { authorization: '' } })).status).toBe(401);
    const b = await setup({ users: GRAPH_USERS });
    b.idp.appTokenClaims({ aud: 'https://outlook.office.com' });
    const wrong = await b.find();
    expect(wrong.status).toBe(401);
    expect(await wrong.json()).toMatchObject({ error: { code: 'InvalidAuthenticationToken' } });
    const c = await setup({ users: GRAPH_USERS });
    c.clock.advance(3_600_000);
    expect((await c.find()).status).toBe(401);
    expect([a, b, c].map((x) => x.graph.seen.rejected)).toEqual([
      ['token.foreign', 'token.missing'],
      ['token.audience'],
      ['token.expired'],
    ]);
  });

  it.each([
    ['a property it never asked for', { $select: 'id,department' }],
    ['an empty $select', { $select: '' }],
    ['$top of 0', { $top: '0' }],
    ['$top over 999', { $top: '1000' }],
    ['$top that is no integer', { $top: '1.5' }],
  ])('refuses %s with 400', async (_, query) => {
    const { graph, find } = await setup({ users: GRAPH_USERS });
    const response = await find(query);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: 'Request_UnsupportedQuery' } });
    expect(graph.seen.rejected).toEqual([
      Object.keys(query)[0] === '$top' ? 'search.top' : 'search.select',
    ]);
    expect((await find({ $top: '999' })).status).toBe(200);
  });

  it('serves GET /users only, and leaves the mail counters alone', async () => {
    const { graph, find } = await setup({ users: GRAPH_USERS });
    expect((await find({}, { method: 'POST' })).status).toBe(405);
    expect((await find({}, { path: '/users/abc' })).status).toBe(404);
    expect((await find({}, { path: '/me' })).status).toBe(404);
    expect(graph.seen.rejected).toEqual(['search.method', 'route', 'route']);
    await find();
    expect(graph.seen).toMatchObject({ calls: 2, callsInsideTransaction: 0, unscopedGrant: false });
    expect(graph.sent).toEqual([]);
  });

  it('answers a scripted failure once, after the checks, then normally', async () => {
    const { graph, find } = await setup({ users: GRAPH_USERS });
    graph.script({ status: 429, retryAfter: '7' }, 503);
    expect((await find({ $top: '0' })).status).toBe(400);
    const throttled = await find();
    expect(throttled.status).toBe(429);
    expect(throttled.headers.get('retry-after')).toBe('7');
    expect(await throttled.json()).toMatchObject({ error: { code: 'TooManyRequests' } });
    expect((await find()).status).toBe(503);
    expect((await find()).status).toBe(200);
    expect(graph.seen.searches).toHaveLength(3);
  });

  it('hangs until the caller aborts, and drops the connection when told to', async () => {
    const { graph, find } = await setup({ users: GRAPH_USERS });
    graph.hang();
    const stop = new AbortController();
    const call = find({}, { signal: stop.signal });
    await vi.waitFor(() => expect(graph.seen.searches).toHaveLength(1));
    stop.abort();
    await expect(call).rejects.toMatchObject({ name: 'AbortError' });
    graph.acceptThenDrop();
    await expect(find()).rejects.toMatchObject({
      message: 'fetch failed',
      cause: { code: 'ECONNRESET' },
    });
    expect(graph.sent).toEqual([]);
  });

  it('records the decoded $search of each search that passed the checks', async () => {
    const { graph, find } = await setup({ users: GRAPH_USERS });
    await find({ $search: '"displayName:Nov" OR "surname:Nov"' });
    await find({ $search: '"mail:x"' }, { headers: { consistencylevel: '' } });
    await find({ $search: '"surname:Dvořák"' });
    expect(graph.seen.searches).toEqual(['"displayName:Nov" OR "surname:Nov"', '"surname:Dvořák"']);
  });

  it('starts with no users and the ReadBasic mode', async () => {
    const { find } = await setup();
    expect(await (await find()).json()).toEqual({ '@odata.count': 0, value: [] });
  });
});
