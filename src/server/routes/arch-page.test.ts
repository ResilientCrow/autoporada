import { describe, expect, it } from 'vitest';

import type { RouteContext } from '../pipeline';
import { archPageSpec } from './arch-page';

const ORIGIN = 'https://autoporada.ssps.cz';
const WELL_FORMED = /^[A-Za-z0-9+/]{22}==$/;
const ctx = {
  requestId: 'req-1',
  principal: null,
  params: Promise.resolve({}),
  run: () => Promise.resolve({ ok: false as const, error: { code: 'unauthenticated' as const } }),
} satisfies RouteContext;

async function open(headers: Record<string, string>) {
  const response = await archPageSpec.handle(new Request(`${ORIGIN}/`, { headers }), ctx);
  const body = await response.text();
  const csp = response.headers.get('content-security-policy') ?? '';
  return {
    body,
    csp,
    scriptNonce: /<script type="module" nonce="([^"]*)"/.exec(body)?.[1],
    policyNonce: /'nonce-([^']*)'/.exec(csp)?.[1],
  };
}

describe('GET / (the Arch page)', () => {
  it('prints the nonce the proxy set, and names the same one in its own policy', async () => {
    const nonce = 'abcdefghijklmnopqrstuv==';
    const page = await open({ 'x-nonce': nonce });
    expect(page.scriptNonce).toBe(nonce);
    expect(page.policyNonce).toBe(nonce);
  });

  it.each([
    ['a nonce that breaks out of the attribute', 'X"><img src=x>'],
    ['a nonce of the wrong length', 'abc=='],
    ['a well-formed nonce with a tag after it', 'abcdefghijklmnopqrstuv==<b>'],
    ['an empty nonce', ''],
  ])('never prints %s, and makes its own', async (_name, sent) => {
    const page = await open({ 'x-nonce': sent });
    if (sent !== '') expect(page.body).not.toContain(sent.trim());
    expect(page.body).not.toContain('<img');
    expect(page.scriptNonce).toMatch(WELL_FORMED);
    expect(page.policyNonce).toBe(page.scriptNonce);
  });

  it('makes its own nonce, a new one each time, when the request has none', async () => {
    const first = await open({});
    const second = await open({});
    expect(first.scriptNonce).toMatch(WELL_FORMED);
    expect(first.policyNonce).toBe(first.scriptNonce);
    expect(second.scriptNonce).not.toBe(first.scriptNonce);
  });

  it('always carries a policy that allows scripts only with that nonce', async () => {
    const { csp, policyNonce } = await open({});
    expect(csp).toContain(`script-src 'self' 'nonce-${policyNonce}' 'strict-dynamic'`);
    expect(csp).toContain("frame-ancestors 'none'");
  });
});
