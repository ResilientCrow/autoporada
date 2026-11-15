import { describe, expect, it } from 'vitest';

import type { UserPrincipal } from '@/application/ports';

import { createFakeConverter } from '../../../test/support/fake-converter';
import { recordingLog } from '../../../test/support/log';
import { setupWorld } from '../../../test/support/world';
import { runRoute, type RouteDeps } from '../pipeline';
import { createRateLimiter, LIMITS } from '../rate-limit';
import { archConvertSpec, MAX_DOC_BYTES } from './arch-convert';

const world = setupWorld();
const ORIGIN = 'https://autoporada.ssps.cz';
const OLE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
/** An OLE header with the directory entry a Word document has. */
const withStream = (name: string) =>
  new Uint8Array([...OLE, 1, 2, 3, ...Buffer.from(name, 'utf16le'), 4, 5]);
const DOC = withStream('WordDocument');

function setup(principal: UserPrincipal | null, importMax: number = LIMITS.import.max) {
  const { log, lines } = recordingLog();
  const converter = createFakeConverter();
  const limiter = createRateLimiter({
    limits: { ...LIMITS, import: { ...LIMITS.import, max: importMax } },
    now: () => 0,
  });
  const deps: RouteDeps = {
    app: world.deps,
    useCases: new Set(),
    resolvePrincipal: (token) => Promise.resolve(token === 'good' ? principal : null),
    limiter,
    log,
    appOrigin: ORIGIN,
    requestIdFrom: () => 'req-1',
  };
  const spec = archConvertSpec(() => ({ converter, limiter, log }));
  const post = (
    body: BodyInit | null = DOC as BodyInit,
    init: { headers?: Record<string, string>; origin?: string; stream?: boolean } = {},
  ) =>
    runRoute(
      deps,
      spec,
      new Request(`${ORIGIN}/api/arch/convert`, {
        method: 'POST',
        headers: {
          origin: init.origin ?? ORIGIN,
          cookie: '__Host-ap_session=good',
          'content-type': 'application/msword',
          // A Request built here sets no length of its own; a real one always sends it.
          ...(body instanceof Uint8Array && { 'content-length': String(body.byteLength) }),
          ...init.headers,
        },
        body,
        ...(init.stream && { duplex: 'half' }),
      } as RequestInit),
      { params: Promise.resolve({}) },
    );
  return { post, converter, lines };
}

const as = async (role: 'headmaster' | 'submitter') => world.as(await world.seed.user({ role }));

describe('POST /api/arch/convert', () => {
  it('turns a .doc into a PDF for the headmaster', async () => {
    const { post, converter } = setup(await as('headmaster'));
    const response = await post();
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('content-disposition')).toMatch(/^attachment/);
    expect(response.headers.get('content-security-policy')).toBe('sandbox');
    expect(new TextDecoder().decode((await response.arrayBuffer()).slice(0, 5))).toBe('%PDF-');
    expect(converter.docCalls).toHaveLength(1);
    expect(converter.docCalls[0]?.doc).toEqual(DOC);
    expect(converter.docCalls[0]?.insideTransaction).toBe(false);
    expect(converter.calls).toHaveLength(0);
  });

  it('refuses anyone but the headmaster before reading the file', async () => {
    const { post, converter } = setup(await as('submitter'));
    const response = await post();
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ ok: false, error: { code: 'forbidden' } });
    expect(converter.docCalls).toHaveLength(0);
  });

  it('refuses another origin and a signed-out request', async () => {
    const headmaster = setup(await as('headmaster'));
    expect(
      (await headmaster.post(DOC as BodyInit, { origin: 'https://evil.example' })).status,
    ).toBe(403);
    const out = setup(null);
    expect((await out.post()).status).not.toBe(200);
    expect(out.converter.docCalls).toHaveLength(0);
  });

  it('counts conversions on its own limit and says when to retry', async () => {
    const { post, converter } = setup(await as('headmaster'), 1);
    expect((await post()).status).toBe(200);
    const limited = await post();
    expect(limited.status).toBe(429);
    const body = (await limited.json()) as {
      ok: boolean;
      error: { code: string; retryAfterSeconds: number };
    };
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe('rate-limited');
    expect(body.error.retryAfterSeconds).toBeGreaterThan(0);
    expect(converter.docCalls).toHaveLength(1);
  });

  it("has a bucket of its own: the headmaster's other writes do not spend it", () => {
    expect(LIMITS.import).toEqual({ max: 20, windowMs: 3_600_000, key: 'user' });
    expect(MAX_DOC_BYTES).toBe(10_000_000);
  });

  it('converts one file at a time: the next one is told to wait', async () => {
    const { post, converter } = setup(await as('headmaster'));
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let entered!: () => void;
    const inside = new Promise<void>((resolve) => (entered = resolve));
    const real = converter.docToPdf;
    converter.docToPdf = async (doc) => {
      entered();
      await gate;
      return real(doc);
    };
    const first = post();
    await inside;
    const second = await post();
    expect(second.status).toBe(429);
    const body = (await second.json()) as { error: { code: string; retryAfterSeconds: number } };
    expect(body.error.code).toBe('rate-limited');
    expect(body.error.retryAfterSeconds).toBeGreaterThan(0);
    release();
    expect((await first).status).toBe(200);
    // The slot is free again, also after a failure.
    converter.docToPdf = () => Promise.reject(new Error('boom'));
    await post().catch(() => undefined);
    converter.docToPdf = real;
    expect((await post()).status).toBe(200);
  });

  it('refuses a body past 10 MB, declared or streamed', async () => {
    const { post, converter } = setup(await as('headmaster'));
    const declared = await post(DOC as BodyInit, {
      headers: { 'content-length': String(MAX_DOC_BYTES + 1) },
    });
    expect(declared.status).toBe(413);
    expect(await declared.json()).toEqual({ ok: false, error: { code: 'too-long' } });
    const big = new Uint8Array(MAX_DOC_BYTES + 1);
    big.set(DOC);
    expect((await post(big as BodyInit, { headers: { 'content-length': '5' } })).status).toBe(413);
    expect(converter.docCalls).toHaveLength(0);
  });

  it('refuses a request with no length', async () => {
    const { post, converter } = setup(await as('headmaster'));
    // `post` takes the length from the bytes; a streamed body carries none.
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(DOC);
        controller.close();
      },
    });
    const response = await post(stream, { headers: {}, stream: true });
    expect(response.status).toBe(413);
    expect(converter.docCalls).toHaveLength(0);
  });

  it.each([
    ['a PDF', new TextEncoder().encode('%PDF-1.7 hello')],
    ['a DOCX', new Uint8Array([0x50, 0x4b, 3, 4, 0, 0])],
    ['an OLE file with no WordDocument stream (a spreadsheet)', withStream('Workbook')],
    [
      'a WordDocument name in 8-bit text, not in the directory',
      new Uint8Array([...OLE, ...Buffer.from('WordDocument')]),
    ],
  ])('refuses %s: the file is not a Word document', async (_, bytes) => {
    const { post, converter } = setup(await as('headmaster'));
    const response = await post(bytes as BodyInit);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: { code: 'invalid' } });
    expect(converter.docCalls).toHaveLength(0);
  });

  it('answers 502 and logs only the code when the converter fails', async () => {
    const { post, converter, lines } = setup(await as('headmaster'));
    converter.script({ ok: false, code: 'convert.http.500' });
    const response = await post();
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ ok: false, error: { code: 'convert-failed' } });
    const logged = JSON.stringify(lines);
    expect(logged).toContain('convert.http.500');
    expect(logged).not.toContain('Ð');
  });
});
