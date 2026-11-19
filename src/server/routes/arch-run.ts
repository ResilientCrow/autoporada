/**
 * Branch arch-ui only: the Arch UI's two endpoints. GET answers the viewer's state, POST runs one
 * use case by name through `runAction`'s pipeline (session, rate limit, access,
 * validation). The one write that is not a use case is the annexes of a porada (`arch.annexes`),
 * kept in the branch's own table `arch_annexes`, headmaster only.
 */
import { z } from 'zod';

import { can } from '@/domain/policy';
import { ANNEXES_MAX_BYTES } from '@/domain/report';
import { issueAnnexSchema } from '@/snapshot';

import { getContainer } from '../container';
import { runAction, sessionTokenFrom, type RouteSpec } from '../pipeline';
import { json, rateLimited } from './arch-http';
import { retypeRequest } from './arch-retype';
import { archState } from './arch-state';

type UserLimitName = 'autosave' | 'submission' | 'admin';

export const AUTOSAVE = new Set(['points.save', 'future.save']);
export const SUBMISSION = new Set([
  'points.create',
  'points.submit',
  'points.retract',
  'points.withdraw',
  'future.create',
  'future.submit',
  'future.retract',
  'future.requestCancel',
  'future.retractCancel',
  'future.withdraw',
  'future.startReport',
  'access.request',
  'access.cancel',
  'users.setAddress',
]);
export const limitOf = (name: string): UserLimitName =>
  AUTOSAVE.has(name) ? 'autosave' : SUBMISSION.has(name) ? 'submission' : 'admin';

/** The headmaster's annexes with pictures: the 3.5 MB annex cap and their ids; Caddy's `@run` matches it. */
export const MAX_BODY_BYTES = 4_000_000;
/** Every other body is a few fields; anyone without `issue.edit` is refused above this before it is parsed. */
export const SMALL_BODY_BYTES = 1_000_000;

/** GET /api/arch/state: the viewer's state. Signed out, the pipeline redirects; the client then shows its sign-in. */
export const archStateSpec: RouteSpec = {
  name: 'arch.state',
  access: 'session',
  rateLimit: 'state',
  async handle(_request, ctx) {
    return json(await archState(getContainer(), ctx.principal!, ctx.requestId));
  },
};

/** POST /api/arch/run: one use case by name; its own rate limit applies inside runAction. */
export const archRunSpec: RouteSpec = {
  name: 'arch.run',
  access: 'session',
  rateLimit: 'none',
  async handle(request, ctx) {
    const principal = ctx.principal!;
    const size = Number(request.headers.get('content-length'));
    if (
      !size ||
      size > MAX_BODY_BYTES ||
      (size > SMALL_BODY_BYTES && !can(principal.actor, { action: 'issue.edit' }))
    )
      return json({ ok: false, error: { code: 'too-long' } }, 413);
    const c = getContainer();
    const body = (await request.json().catch(() => null)) as {
      name?: unknown;
      input?: unknown;
    } | null;
    const name = typeof body?.name === 'string' ? body.name : '';
    if (name === 'arch.annexes') return saveAnnexes(principal.actor, body?.input);
    if (name === 'arch.retype') return retype(principal.actor.id, body?.input);
    const useCase = [...c.useCases].find((u) => u.name === name && u.principal === 'user');
    if (!useCase) return json({ ok: false, error: { code: 'not-found' } }, 404);
    const token = sessionTokenFrom(request.headers.get('cookie'));
    const result = await runAction(
      c,
      { sessionToken: token, requestId: ctx.requestId },
      useCase,
      { rateLimit: limitOf(name) },
      body?.input ?? {},
    );
    return json(result);
  },
};

const annexImage = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+=*$/;

/** The ids the client keys its annexes and parts by; the snapshot keeps the content only. */
const withoutIds = (annexes: unknown[]): unknown[] =>
  annexes.map((annex) => {
    if (typeof annex !== 'object' || annex === null) return annex;
    const { id: _id, parts, ...rest } = annex as { id?: unknown; parts?: unknown };
    return {
      ...rest,
      parts: Array.isArray(parts)
        ? parts.map((part: unknown) => {
            if (typeof part !== 'object' || part === null) return part;
            const { id: _partId, ...content } = part as { id?: unknown };
            return content;
          })
        : parts,
    };
  });

/** `{ monday, annexes }`: the porada's own annexes, in the shape its snapshot takes. */
async function saveAnnexes(actor: Parameters<typeof can>[0], input: unknown): Promise<Response> {
  if (!can(actor, { action: 'issue.edit' }))
    return json({ ok: false, error: { code: 'forbidden' } }, 403);
  const c = getContainer();
  const decision = c.limiter.take('admin', actor.id);
  if (!decision.ok) return rateLimited(decision.retryAfterMs);
  const { monday, annexes } = (input ?? {}) as { monday?: unknown; annexes?: unknown };
  const list = Array.isArray(annexes) ? annexes : null;
  const parsed = list ? z.array(issueAnnexSchema).safeParse(withoutIds(list)) : null;
  if (typeof monday !== 'string' || !z.iso.date().safeParse(monday).success || !parsed?.success) {
    return json({ ok: false, error: { code: 'invalid' } }, 400);
  }
  const images = parsed.data.flatMap((a) =>
    a.parts.flatMap((p) => (p.kind === 'image' ? [p] : [])),
  );
  if (
    images.some(
      (i) => !annexImage.test(i.src) || !(i.w > 0 && i.w <= 2000 && i.h > 0 && i.h <= 3000),
    )
  ) {
    return json({ ok: false, error: { code: 'invalid' } }, 400);
  }
  if (Buffer.byteLength(JSON.stringify(list)) > ANNEXES_MAX_BYTES) {
    return json({ ok: false, error: { code: 'too-long' } }, 400);
  }
  const saved = await c.arch.saveAnnexes(monday, list!, actor.id, c.app.clock.now());
  if (saved === 'saved') return json({ ok: true, data: {} });
  // A dropped porada is gone (ADR 0054 item 7), as `ensureIssue` answers a use case.
  return saved === 'not-found'
    ? json({ ok: false, error: { code: 'not-found' } }, 404)
    : json({ ok: false, error: { code: 'conflict' } }, 409);
}

/** The author moves a draft proposal between finance and pokyn. */
async function retype(userId: string, input: unknown): Promise<Response> {
  const decision = getContainer().limiter.take('submission', userId);
  if (!decision.ok) return rateLimited(decision.retryAfterMs);
  const request = retypeRequest(input);
  if (!request) return json({ ok: false, error: { code: 'invalid' } }, 400);
  const version = await getContainer().arch.retype({ ...request, authorId: userId });
  return version !== null
    ? json({ ok: true, data: { version } })
    : json({ ok: false, error: { code: 'conflict' } }, 409);
}
