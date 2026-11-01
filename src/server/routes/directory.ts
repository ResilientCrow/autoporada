import type { DirectoryCode, DirectoryPort } from '@/application/ports';
import { searchGate } from '@/application/use-cases';
import {
  DIRECTORY_FAILURE_STATUS,
  directorySearchRequest,
  directorySearchResponse,
  type DirectoryNotice,
  type ErrorCode,
} from '@/contracts';

import type { Log } from '../log';
import type { RouteContext, RouteSpec } from '../pipeline';

/** What the search route needs beyond the pipeline; the container has both. */
export interface DirectoryRouteDeps {
  readonly directory: DirectoryPort;
  readonly log: Log;
}

const NAME = 'directory.search';
/** A query is at most DIRECTORY_LIMITS.query characters: a body past 1 KiB is not a search. */
const MAX_BODY_BYTES = 1024;

const NOTICES: Readonly<Record<DirectoryCode, DirectoryNotice>> = {
  'directory.off': 'off',
  'directory.unavailable': 'unavailable',
  'directory.throttled': 'throttled',
  'directory.denied': 'denied',
  'directory.timeout': 'timeout',
};

const status = (code: number) => new Response(null, { status: code });

/** The gate's refusal as an HTTP status: the client only learns that it may not search. */
function refusal(code: ErrorCode): Response {
  if (code === 'unauthenticated') return status(401);
  if (code === 'forbidden' || code === 'not-found') return status(403);
  return status(500);
}

/** The body as text, or null once it passes the cap, without reading the rest. */
async function boundedText(request: Request): Promise<string | null> {
  // A length that is no number is as unbounded as a large one.
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (Number.isNaN(declared) || declared > MAX_BODY_BYTES) return null;
  if (!request.body) return '';
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return text + decoder.decode();
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    text += decoder.decode(value, { stream: true });
  }
}

function parseQuery(text: string): string | null {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  const parsed = directorySearchRequest.safeParse(json);
  return parsed.success ? parsed.data.q : null;
}

async function search(
  deps: DirectoryRouteDeps,
  request: Request,
  ctx: RouteContext,
): Promise<Response> {
  const text = await boundedText(request);
  if (text === null) return status(413);
  const q = parseQuery(text);
  if (q === null) return status(400);
  // Phase 1 in its own read transaction: a refused reader never reaches the directory (F14).
  const gate = await ctx.run(searchGate, {});
  if (!gate.ok) return refusal(gate.error.code);
  // Phase 2 outside any transaction: a slow directory holds no connection.
  const found = await deps.directory.search(q, request.signal);
  if (found.ok) return Response.json(directorySearchResponse.parse({ hits: found.value }));
  // The client went away (the next keystroke): nobody reads an answer, and it is no failure.
  if (request.signal.aborted) return status(204);
  // The code and its fixed detail only: the query is the reader's own text (ADR 0015).
  deps.log.warn(
    {
      name: NAME,
      reqId: ctx.requestId,
      code: found.code,
      ...(found.detail && { detail: found.detail }),
    },
    'directory failed',
  );
  return Response.json(directorySearchResponse.parse({ hits: [], notice: NOTICES[found.code] }));
}

/**
 * `POST /api/adresar/hledat` (design section 4): a route, not an action, so a
 * slow search never queues the editor's autosaves behind it (ADR 0019).
 * Nothing is stored and nothing is audited; the pipeline answers `no-store`.
 */
export function directoryRouteSpec(deps: () => DirectoryRouteDeps): RouteSpec {
  return {
    name: NAME,
    access: 'session',
    rateLimit: 'directory',
    handle: (request, ctx) => search(deps(), request, ctx),
    // An exception is a 500 whose body names what broke, so the box says so instead of
    // „down“. 500, not 503: it may be a bug, and the client reads a body only from this status.
    failure: ({ cause, detail }) =>
      Response.json(
        directorySearchResponse.parse({ hits: [], failure: cause, ...(detail && { detail }) }),
        { status: DIRECTORY_FAILURE_STATUS },
      ),
  };
}
