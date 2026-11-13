import { describe, expect, it } from 'vitest';

import { DatabaseFailure, LockTimeout, type UserPrincipal } from '@/application/ports';
import { downloadDocument, generateIssue } from '@/application/use-cases';
import type { ActionError } from '@/contracts';

import { recordingLog } from '../../../test/support/log';
import { setupWorld } from '../../../test/support/world';
import { runRoute, type RouteContext, type RouteDeps } from '../pipeline';
import { createRateLimiter, LIMITS } from '../rate-limit';
import { documentRouteSpec } from './documents';

const world = setupWorld();
const ORIGIN = 'https://autoporada.ssps.cz';
// The clock starts Monday 19 October 2026: this week's porada is the first one open.
const MONDAY = '2026-10-19';

interface Variation {
  readonly app?: RouteDeps['app'];
  readonly limits?: Parameters<typeof createRateLimiter>[0]['limits'];
}

function setup(principal: UserPrincipal | null, vary: Variation = {}) {
  const { log, lines } = recordingLog();
  const deps: RouteDeps = {
    app: vary.app ?? world.deps,
    useCases: new Set([downloadDocument]),
    resolvePrincipal: (token) => Promise.resolve(token === 'good' ? principal : null),
    limiter: createRateLimiter({ limits: vary.limits ?? LIMITS, now: () => 0 }),
    log,
    appOrigin: ORIGIN,
    requestIdFrom: () => 'req-1',
  };
  const get = (format: string, datum = MONDAY, init: { method?: string; site?: string } = {}) =>
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
  return Object.assign(get, { lines });
}

/** The archive page the download answers send the reader to, with `chyba` naming why. */
const ARCHIVE = '/porada/archiv';
const archiveWith = (chyba: string) => `${ARCHIVE}?chyba=${chyba}`;

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
      'attachment; filename="porada-2026-10-19.docx"',
    );
    expect(response.headers.get('cache-control')).toBe('no-store');
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(bytes.slice(0, 2)).toEqual(new Uint8Array([0x50, 0x4b]));
  });

  it('sends a PDF not converted yet, another format and a porada without a document to the archive as not-found', async () => {
    const get = setup(await generated());
    for (const [format, datum] of [
      ['pdf', MONDAY],
      ['odt', MONDAY],
      ['docx', '2026-11-02'],
      ['docx', 'zitra'],
    ] as const) {
      const response = await get(format, datum);
      expect(response.status).toBe(303);
      expect(response.headers.get('location')).toBe(archiveWith('not-found'));
      expect(response.headers.get('cache-control')).toBe('no-store');
    }
  });

  it('sends a submitter, who may not read the archive, to the archive as not-found', async () => {
    await generated();
    const submitter = world.as(await world.seed.user({ role: 'submitter' }));
    const response = await setup(submitter)('docx');
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(archiveWith('not-found'));
  });

  it('sends a signed-out reader to the Arch client, whose signed-out screen is the sign-in', async () => {
    await generated();
    const signedOut = await setup(null)('docx');
    expect(signedOut.status).toBe(303);
    expect(signedOut.headers.get('location')).toBe(`${ORIGIN}/`);
  });

  describe('what each refusal of the use case becomes', () => {
    /** The handler alone, told by a fake context what the use case answered. */
    const answered = async (error: ActionError) => {
      const ctx = {
        requestId: 'req-1',
        principal: null,
        params: Promise.resolve({ datum: MONDAY, format: 'docx' }),
        run: () => Promise.resolve({ ok: false as const, error }),
      } satisfies RouteContext;
      const request = new Request(`${ORIGIN}/porada/${MONDAY}/dokument/docx`);
      return documentRouteSpec.handle(request, ctx);
    };

    it('sends an ended session to sign in, back to the archive', async () => {
      const response = await answered({ code: 'unauthenticated' });
      expect(response.status).toBe(303);
      const location = new URL(response.headers.get('location') ?? '', ORIGIN);
      expect(location.pathname).toBe('/prihlaseni');
      expect(location.searchParams.get('returnTo')).toBe(ARCHIVE);
    });

    it.each<[ActionError, string]>([
      [{ code: 'forbidden' }, 'not-found'],
      [{ code: 'not-found' }, 'not-found'],
      [{ code: 'invalid-input', fields: {} }, 'not-found'],
      [{ code: 'rate-limited', retryAfterSeconds: 5 }, 'rate-limited'],
      [{ code: 'busy' }, 'timeout'],
      [{ code: 'unavailable', cause: 'database-down' }, 'database-down'],
      [{ code: 'conflict' }, 'bug'],
      [{ code: 'step-up-required' }, 'bug'],
      [{ code: 'rule', rule: 'last-headmaster' }, 'bug'],
    ])('sends %j to the archive as %s', async (error, chyba) => {
      const response = await answered(error);
      expect(response.status).toBe(303);
      expect(response.headers.get('location')).toBe(archiveWith(chyba));
    });
  });

  it('answers a rate limit with a redirect to the archive naming it', async () => {
    const limits = { ...LIMITS, admin: { ...LIMITS.admin, max: 1 } };
    const get = setup(await generated(), { limits });
    expect((await get('docx')).status).toBe(200);
    const limited = await get('docx');
    expect(limited.status).toBe(303);
    expect(limited.headers.get('location')).toBe(archiveWith('rate-limited'));
    expect(limited.headers.get('x-request-id')).toBe('req-1');
  });

  describe('when something throws', () => {
    const down = (error: unknown): RouteDeps['app'] => ({
      ...world.deps,
      db: { transaction: () => Promise.reject(error) },
    });

    it.each([
      ['a lost database', new DatabaseFailure('08006'), 'database-down'],
      ['a statement timeout', new DatabaseFailure('57014'), 'timeout'],
      ['a lock timeout', new LockTimeout(), 'timeout'],
      ['a missing table', new DatabaseFailure('42P01'), 'database-setup'],
      [
        'a stored row that does not parse',
        new DatabaseFailure('db.parse.documents'),
        'stored-data',
      ],
      ['a bug', new TypeError('x is undefined'), 'bug'],
    ])('redirects to the archive with the cause of %s', async (_what, error, cause) => {
      const get = setup(await generated(), { app: down(error) });
      const response = await get('docx');
      expect(response.status).toBe(303);
      expect(response.headers.get('location')).toBe(archiveWith(cause));
      expect(response.headers.get('x-request-id')).toBe('req-1');
    });

    it('logs the failure with its cause, as before', async () => {
      const get = setup(await generated(), { app: down(new DatabaseFailure('08006')) });
      await get('docx');
      const errors = get.lines.filter((l) => l.level === 'error');
      expect(errors).toHaveLength(1);
      expect(errors[0]?.fields).toMatchObject({ cause: 'database-down' });
    });
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
