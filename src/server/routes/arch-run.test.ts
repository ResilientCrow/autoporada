import { describe, expect, it, vi } from 'vitest';

import type { UserPrincipal } from '@/application/ports';

import { recordingLog } from '../../../test/support/log';
import { setupWorld } from '../../../test/support/world';
import { runRoute, type RouteDeps } from '../pipeline';
import { createRateLimiter, LIMITS } from '../rate-limit';
import { archRunSpec, MAX_BODY_BYTES, SMALL_BODY_BYTES } from './arch-run';

// `saveAnnexes` reaches the store through the process container; only what it touches is stood in.
const saved = vi.hoisted(() => ({ saveAnnexes: vi.fn(async () => 'saved' as const) }));
vi.mock('../container', () => ({
  getContainer: () => ({
    limiter: { take: () => ({ ok: true }) },
    arch: { saveAnnexes: saved.saveAnnexes },
    app: { clock: { now: () => new Date('2026-10-19T08:00:00Z') } },
    useCases: new Set(),
  }),
}));

const world = setupWorld();
const ORIGIN = 'https://autoporada.ssps.cz';

function setup(principal: UserPrincipal) {
  const { log } = recordingLog();
  const deps: RouteDeps = {
    app: world.deps,
    useCases: new Set(),
    resolvePrincipal: (token) => Promise.resolve(token === 'good' ? principal : null),
    limiter: createRateLimiter({ limits: LIMITS, now: () => 0 }),
    log,
    appOrigin: ORIGIN,
    requestIdFrom: () => 'req-1',
  };
  // Only the declared length matters: both refusals come before the body is read.
  return (length: number, body = '{}') =>
    runRoute(
      deps,
      archRunSpec,
      new Request(`${ORIGIN}/api/arch/run`, {
        method: 'POST',
        headers: {
          origin: ORIGIN,
          cookie: '__Host-ap_session=good',
          'content-type': 'application/json',
          'content-length': String(length),
        },
        body,
      }),
      { params: Promise.resolve({}) },
    );
}

describe('POST /api/arch/run body size', () => {
  it('refuses a body over 1 MB from anyone without issue.edit, before parsing it', async () => {
    const post = setup(world.as(await world.seed.user({ role: 'submitter' })));
    const response = await post(SMALL_BODY_BYTES + 1);
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ ok: false, error: { code: 'too-long' } });
  });

  it('refuses a body over the annex cap from anyone, the headmaster too', async () => {
    const post = setup(world.as(await world.seed.user({ role: 'headmaster' })));
    expect((await post(MAX_BODY_BYTES + 1)).status).toBe(413);
    expect((await post(0)).status).toBe(413);
  });

  it('lets the headmaster past 1 MB to the handler', async () => {
    const post = setup(world.as(await world.seed.user({ role: 'headmaster' })));
    // The body is "{}": no use case of that name, so the size check has let it through.
    const response = await post(SMALL_BODY_BYTES + 1);
    expect(response.status).not.toBe(413);
  });
});

describe('POST /api/arch/run arch.annexes', () => {
  const MONDAY = '2026-10-19';
  const png = 'data:image/png;base64,AAAA';
  const annex = (part: object) => ({
    id: 'a-1',
    title: 'Příloha',
    parts: [{ id: 'p-1', ...part }],
  });
  const run = async (part: object) => {
    const post = setup(world.as(await world.seed.user({ role: 'headmaster' })));
    const body = JSON.stringify({
      name: 'arch.annexes',
      input: { monday: MONDAY, annexes: [annex(part)] },
    });
    return post(body.length, body);
  };

  it('saves a table and a picture of ordinary text', async () => {
    saved.saveAnnexes.mockClear();
    expect((await run({ kind: 'table', rows: [['Třída', 'Počet']] })).status).toBe(200);
    expect((await run({ kind: 'image', src: png, w: 10, h: 10, alt: 'Graf voleb' })).status).toBe(
      200,
    );
    expect(saved.saveAnnexes).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['a table cell', { kind: 'table', rows: [['a', 'b\u000bc']] }],
    ['a picture description', { kind: 'image', src: png, w: 10, h: 10, alt: 'Graf\u0001' }],
  ])('refuses a control character in %s as invalid and saves nothing', async (_case, part) => {
    saved.saveAnnexes.mockClear();
    const response = await run(part);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: { code: 'invalid' } });
    expect(saved.saveAnnexes).not.toHaveBeenCalled();
  });
});
