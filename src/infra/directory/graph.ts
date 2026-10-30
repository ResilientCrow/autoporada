import { z } from 'zod';

import type {
  DirectoryCode,
  DirectoryPerson,
  DirectoryPort,
  DirectoryResult,
  IdpFailure,
} from '@/application/ports';
import { directoryHit } from '@/contracts';
import { foldForSearch, searchWords } from '@/domain/cs';
import { DIRECTORY_LIMITS } from '@/domain/report';
import { AppTokenError, type AppTokenSource } from '@/infra/oidc';
import { assertOutsideTransaction } from '@/infra/system';

import { matchesQuery } from './words';

/** The longest query sent to Graph: no name is longer, and a short `$search` is cheap. */
export const QUERY_MAX = 40;
/** Graph answers up to this many; some are dropped (guests, rooms) before the cap. */
const FETCH_TOP = 15;
const SELECT = 'id,displayName,givenName,surname,mail,userPrincipalName';
const DEFAULT_TIMEOUT_MS = 3_000;

/** The fetch the adapter needs: the global one, or a test's in-process Graph. */
export type DirectoryFetch = (
  url: string,
  init: {
    readonly method: string;
    readonly headers: Readonly<Record<string, string>>;
    readonly signal: AbortSignal;
  },
) => Promise<Response>;

const text = z.string().nullish();
/** What the adapter reads of Graph's answer; keys it does not know are ignored. */
const answer = z.object({
  value: z.array(
    z.object({
      id: z.string(),
      displayName: text,
      givenName: text,
      surname: text,
      mail: text,
      userPrincipalName: text,
    }),
  ),
});

/** Why a token could not be had: a refused credential or consent is `denied`, the rest `unavailable`. */
const TOKEN_FAILURE: Readonly<Record<IdpFailure, DirectoryCode>> = {
  cancelled: 'directory.denied',
  'idp-error': 'directory.denied',
  'invalid-response': 'directory.unavailable',
  unavailable: 'directory.unavailable',
};

const failed = (code: DirectoryCode, detail?: string): DirectoryResult<never> =>
  detail === undefined ? { ok: false, code } : { ok: false, code, detail };

/** The status class for the log; 429 and the like are 4xx, a 2xx or 3xx that is not 200 is `other`. */
function statusClass(status: number): string {
  if (status >= 400 && status < 500) return 'http-4xx';
  return status >= 500 && status < 600 ? 'http-5xx' : 'http-other';
}

/** `token:` and the parts AppTokenError allow-lists: the stage and one of AADSTS, OAuth error or code. */
function tokenDetail(error: AppTokenError): string {
  const { stage, aadsts, error: oauth, code } = error.detail;
  return ['token', stage, aadsts ?? oauth ?? code].filter(Boolean).join(':');
}

/** What `$search` takes: NFC, one space between words, no character of its grammar, at most QUERY_MAX. */
function clean(query: string): string {
  const plain = query
    .normalize('NFC')
    .replace(/["\\&]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return Array.from(plain).slice(0, QUERY_MAX).join('').trim();
}

const isGuest = (upn: string | null | undefined) => (upn ?? '').toLowerCase().includes('#ext#');

/** Hits in Graph's order: real people only, matching the query, and fit for the route. */
function people(value: z.infer<typeof answer>['value'], wanted: readonly string[]) {
  const found: DirectoryPerson[] = [];
  for (const user of value) {
    if (isGuest(user.userPrincipalName)) continue;
    // Rooms and shared mailboxes have no given name or no surname: the hit contract wants both.
    const hit = directoryHit.safeParse({
      graphId: user.id,
      givenName: user.givenName?.trim() ?? '',
      familyName: user.surname?.trim() ?? '',
      displayName: user.displayName ?? '',
    });
    if (hit.success && matchesQuery(wanted, hit.data)) found.push(hit.data);
    if (found.length === DIRECTORY_LIMITS.hits) break;
  }
  return found;
}

/**
 * The school people search through Microsoft Graph `GET /users?$search`, with the app's own token.
 * Nothing throws and nothing is logged here (the route logs the code and the fixed `detail`): a 429 is `throttled`, a
 * 401 that survives one fresh token or a 403 is `denied`, the caller's abort or the timeout is
 * `timeout`, everything else `unavailable`. The body of a failed answer is closed, never read.
 */
export function createGraphDirectory(options: {
  readonly baseUrl: string;
  readonly tokens: AppTokenSource;
  readonly fetch?: DirectoryFetch;
  readonly timeoutMs?: number;
}): DirectoryPort {
  const { tokens } = options;
  const fetch: DirectoryFetch = options.fetch ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  async function call(
    url: string,
    wanted: readonly string[],
    signal: AbortSignal,
    refreshed: boolean,
  ): Promise<DirectoryResult<readonly DirectoryPerson[]>> {
    const token = await tokens.token(signal);
    const response = await fetch(url, {
      method: 'GET',
      headers: { authorization: `Bearer ${token}`, ConsistencyLevel: 'eventual' },
      signal,
    });
    const { status } = response;
    if (status !== 200) {
      await response.body?.cancel();
      if (status === 401) tokens.invalidate();
      if (status === 401 && !refreshed) return call(url, wanted, signal, true);
      const detail = statusClass(status);
      if (status === 429) return failed('directory.throttled', detail);
      if (status === 401 || status === 403) return failed('directory.denied', detail);
      return failed('directory.unavailable', detail);
    }
    const parsed = answer.safeParse(await response.json());
    if (!parsed.success) return failed('directory.unavailable', 'body');
    return { ok: true, value: people(parsed.data.value, wanted) };
  }

  return {
    async search(query, signal) {
      assertOutsideTransaction('Graph user search');
      const cleaned = clean(query);
      if (foldForSearch(cleaned).length < DIRECTORY_LIMITS.minQuery) return { ok: true, value: [] };
      const wanted = searchWords(cleaned);
      if (wanted.length === 0) return { ok: true, value: [] };
      const combined = AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]);
      if (combined.aborted) return failed('directory.timeout');
      const params = new URLSearchParams({
        $search: `"displayName:${cleaned}" OR "surname:${cleaned}"`,
        $select: SELECT,
        $top: String(FETCH_TOP),
        $count: 'true',
      });
      try {
        return await call(`${options.baseUrl}/users?${params}`, wanted, combined, false);
      } catch (error) {
        if (combined.aborted) return failed('directory.timeout');
        if (error instanceof AppTokenError) {
          return failed(TOKEN_FAILURE[error.failure], tokenDetail(error));
        }
        // A body that is no JSON is a SyntaxError; anything else came from fetch.
        return failed('directory.unavailable', error instanceof SyntaxError ? 'body' : 'network');
      }
    },
  };
}
