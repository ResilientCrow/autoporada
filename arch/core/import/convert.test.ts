import { describe, expect, it } from 'vitest';
import { convertDocWith } from './convert';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const bytes = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0]);

describe('convertDocWith', () => {
  it('posts the bytes as application/msword and returns the PDF', async () => {
    let seen: { url: string; init: RequestInit } | undefined;
    const out = await convertDocWith((url, init) => { seen = { url: String(url), init: init! }; return Promise.resolve(new Response(new Uint8Array([37, 80, 68, 70]), { status: 200, headers: { 'content-type': 'application/pdf' } })); }, bytes);
    expect(Array.from(out)).toEqual([37, 80, 68, 70]);
    expect(seen?.url).toBe('/api/arch/convert');
    expect(seen?.init.method).toBe('POST');
    expect(seen?.init.credentials).toBe('same-origin');
    expect(new Headers(seen?.init.headers).get('content-type')).toBe('application/msword');
  });

  it.each([
    [429, { ok: false, error: { code: 'rate-limited', retryAfterSeconds: 90 } }, 'rate-limited'],
    [413, { ok: false, error: { code: 'too-long' } }, 'file-too-big'],
    [502, { ok: false, error: { code: 'convert-failed' } }, 'doc-failed'],
    [400, { ok: false, error: { code: 'invalid' } }, 'doc-failed'],
    [403, { ok: false, error: { code: 'forbidden' } }, 'doc-failed'],
  ])('maps %i to %s', async (status, body, code) => {
    await expect(convertDocWith(() => Promise.resolve(json(status, body)), bytes)).rejects.toEqual(expect.objectContaining({ code }));
  });

  it('says file-too-big for any 413, whatever the body', async () => {
    for (const body of ['', '<html>Request Entity Too Large</html>', JSON.stringify({ ok: false, error: { code: 'whatever' } })])
      await expect(convertDocWith(() => Promise.resolve(new Response(body, { status: 413 })), bytes)).rejects.toEqual(expect.objectContaining({ code: 'file-too-big' }));
  });

  it('sends a signed-out answer to the app\'s sign-in path, not to doc-failed', async () => {
    await expect(convertDocWith(() => Promise.resolve(json(401, { ok: false, error: { code: 'unauthenticated' } })), bytes)).rejects.toEqual(expect.objectContaining({ code: 'signed-out' }));
    await expect(convertDocWith(() => Promise.resolve(new Response('', { status: 401 })), bytes)).rejects.toEqual(expect.objectContaining({ code: 'signed-out' }));
    const redirected = { ok: false, status: 0, type: 'opaqueredirect', headers: new Headers(), json: () => Promise.reject(new Error('none')) } as unknown as Response;
    await expect(convertDocWith(() => Promise.resolve(redirected), bytes)).rejects.toEqual(expect.objectContaining({ code: 'signed-out' }));
    await expect(convertDocWith(() => Promise.resolve(json(403, { ok: false, error: { code: 'step-up-required' } })), bytes)).rejects.toEqual(expect.objectContaining({ code: 'step-up' }));
  });

  it('does not follow a redirect, as the state read does not', async () => {
    let init: RequestInit | undefined;
    await convertDocWith((_u, i) => { init = i; return Promise.resolve(new Response(new Uint8Array([37]), { headers: { 'content-type': 'application/pdf' } })); }, bytes);
    expect(init?.redirect).toBe('manual');
  });

  it('keeps the wait of a rate limit', async () => {
    await expect(convertDocWith(() => Promise.resolve(json(429, { ok: false, error: { code: 'rate-limited', retryAfterSeconds: 90 } })), bytes)).rejects.toEqual(expect.objectContaining({ retryAfterSeconds: 90 }));
  });

  it('says doc-failed when the network fails or the answer is no PDF', async () => {
    await expect(convertDocWith(() => Promise.reject(new TypeError('net')), bytes)).rejects.toEqual(expect.objectContaining({ code: 'doc-failed' }));
    await expect(convertDocWith(() => Promise.resolve(new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } })), bytes)).rejects.toEqual(expect.objectContaining({ code: 'doc-failed' }));
  });
});
