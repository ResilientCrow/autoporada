import { describe, expect, it } from 'vitest';

import type { UserPrincipal } from '@/application/ports';
import { downloadDocument, generateIssue } from '@/application/use-cases';

import { recordingLog } from '../../../test/support/log';
import { setupWorld } from '../../../test/support/world';
import { runRoute, type RouteDeps } from '../pipeline';
import { createRateLimiter, LIMITS } from '../rate-limit';
import { documentRouteSpec } from './documents';

const world = setupWorld();
const ORIGIN = 'https://autoporada.ssps.cz';
// The clock starts Monday 19 October 2026; the porada of 26 October is still open.
const MONDAY = '2026-10-26';

function setup(principal: UserPrincipal | null) {
  const { log } = recordingLog();
  const deps: RouteDeps = {
    app: world.deps,
    useCases: new Set([downloadDocument]),
    resolvePrincipal: (token) => Promise.resolve(token === 'good' ? principal : null),
    limiter: createRateLimiter({ limits: LIMITS, now: () => 0 }),
    log,
    appOrigin: ORIGIN,
    requestIdFrom: () => 'req-1',
  };
  return (format: string, datum = MONDAY, init: { method?: string; site?: string } = {}) =>
    runRoute(
      deps,
      documentRouteSpec,
      new Request(`${ORIGIN}/porada/${datum}/dokument/${format}`, {
        method: init.method ?? 'GET',
        headers: {
          cookie: '__Host-ap_session=good',
          ...(init.site && { 'sec-fetch-site': init.site }),
        },
      }),
      { params: Promise.resolve({ datum, format }) },
    );
}

async function generated() {
  const head = world.as(await world.seed.user({ role: 'headmaster' }));
  const result = await world.run(generateIssue, head, { monday: MONDAY, confirmed: true });
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return head;
}

describe('GET /porada/[datum]/dokument/[format]', () => {
  it('hands the DOCX out as an attachment named by the meeting date', async () => {
    const get = setup(await generated());
    const response = await get('docx');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    expect(response.headers.get('content-disposition')).toBe(
      'attachment; filename="porada-2026-10-26.docx"',
    );
    expect(response.headers.get('cache-control')).toBe('no-store');
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(bytes.slice(0, 2)).toEqual(new Uint8Array([0x50, 0x4b]));
  });

  it('answers 404 for a PDF not converted yet, another format and a porada without a document', async () => {
    const get = setup(await generated());
    expect((await get('pdf')).status).toBe(404);
    expect((await get('odt')).status).toBe(404);
    expect((await get('docx', '2026-11-02')).status).toBe(404);
    expect((await get('docx', 'zitra')).status).toBe(404);
  });

  it('refuses a submitter, and sends a signed-out reader to sign in', async () => {
    await generated();
    const submitter = world.as(await world.seed.user({ role: 'submitter' }));
    expect((await setup(submitter)('docx')).status).toBe(403);
    const signedOut = await setup(null)('docx');
    expect(signedOut.status).toBe(303);
    expect(signedOut.headers.get('location')).toContain('/prihlaseni');
  });

  it('sends a download another site started to the archive, and answers HEAD 405, auditing neither', async () => {
    const get = setup(await generated());
    const crossSite = await get('docx', MONDAY, { site: 'cross-site' });
    expect(crossSite.status).toBe(303);
    expect(crossSite.headers.get('location')).toBe('/porada/archiv');
    const head = await get('docx', MONDAY, { method: 'HEAD' });
    expect(head.status).toBe(405);
    expect(head.headers.get('allow')).toBe('GET');
    const downloads = async () =>
      (await world.inspect.audit()).filter((row) => row.action === 'document.downloaded');
    expect(await downloads()).toEqual([]);

    expect((await get('docx', MONDAY, { site: 'same-origin' })).status).toBe(200);
    expect((await get('docx', MONDAY, { site: 'none' })).status).toBe(200);
    expect(await downloads()).toHaveLength(2);
  });
});
