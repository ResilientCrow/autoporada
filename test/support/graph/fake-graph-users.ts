/**
 * The fake Graph's `GET /users` people search. It checks what Graph checks of the call the
 * directory adapter sends (method, token, role, ConsistencyLevel, the `$search` grammar, `$select`,
 * `$top`) and refuses everything the adapter never sends.
 *
 * The fake's model of Graph's matching (S9 is still open, so this is a model, not a measurement): a
 * clause `"property:value"` matches when every word of the value, compared case-insensitively but NOT
 * diacritic-folded, is the start of a word of that property; words are split on anything that is no
 * letter or digit (spaces, hyphens, brackets), like the dev directory's. Clauses joined by AND must
 * all match, and AND binds tighter than OR. Users come back in list order, at most `$top`.
 */
import type { GraphRequest, GraphUser, SearchMode } from './fake-graph-api';

const PROPERTIES = [
  'id',
  'displayName',
  'givenName',
  'surname',
  'mail',
  'userPrincipalName',
] as const;
type Property = (typeof PROPERTIES)[number];
const SEARCHABLE: readonly string[] = PROPERTIES.filter((p) => p !== 'id');
const DEFAULT_TOP = 100;
const MAX_TOP = 999;
const ROLES = { basic: 'User.ReadBasic.All', full: 'User.Read.All' } as const;
/** Clauses `"property:value"` joined by OR or AND; a value holds no quote or backslash. */
const SEARCH = /^"[^"\\]*"(?: (?:OR|AND) "[^"\\]*")*$/;

/** What the router lends the handler: its refusals, token checks and the one-shot queue. */
export interface SearchHost {
  readonly users: readonly GraphUser[];
  readonly mode: SearchMode;
  readonly searches: string[];
  readonly refuse: (status: number, reason: string, code?: string) => Response;
  readonly tokenProblem: (authorization: string | null) => string | Record<string, unknown>;
  /** Plays the next scripted step, or answers 200 with `body`. */
  readonly play: (init: GraphRequest, body: object) => Response | Promise<Response>;
}

const words = (text: string): string[] =>
  text
    .toLocaleLowerCase('cs')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

/** The clauses of a valid `$search`, grouped into OR alternatives of AND clauses. */
function parse(search: string): { property: string; value: string }[][] | 'syntax' | 'ampersand' {
  if (!SEARCH.test(search)) return 'syntax';
  const groups: { property: string; value: string }[][] = [[]];
  for (const token of search.split(/("[^"]*")/).filter((t) => t.trim() !== '')) {
    if (token === ' OR ') groups.push([]);
    if (!token.startsWith('"')) continue;
    const inner = token.slice(1, -1);
    const colon = inner.indexOf(':');
    const property = inner.slice(0, colon);
    const value = inner.slice(colon + 1);
    if (colon < 1 || !SEARCHABLE.includes(property) || value === '') return 'syntax';
    if (value.includes('&')) return 'ampersand';
    groups[groups.length - 1]!.push({ property, value });
  }
  return groups;
}

const matches = (user: GraphUser, { property, value }: { property: string; value: string }) =>
  words(value).length > 0 &&
  words(value).every((w) =>
    words(user[property as Exclude<Property, 'id'>] ?? '').some((word) => word.startsWith(w)),
  );

export async function searchUsers(
  host: SearchHost,
  url: URL,
  init: GraphRequest,
): Promise<Response> {
  const { refuse } = host;
  const query = url.searchParams;
  if (init.method !== 'GET') return refuse(405, 'search.method');
  const headers = new Headers(init.headers);
  const claims = host.tokenProblem(headers.get('authorization'));
  if (typeof claims === 'string') return refuse(401, claims);

  const roles = Array.isArray(claims['roles']) ? claims['roles'] : [];
  const full = roles.includes(ROLES.full);
  const denied = 'Authorization_RequestDenied';
  if (!full && !roles.includes(ROLES.basic)) return refuse(403, 'search.role', denied);
  if (!full && host.mode === 'needs-user-read-all' && query.has('$search')) {
    return refuse(403, 'search.role', denied);
  }

  const unsupported = 'Request_UnsupportedQuery';
  const search = query.get('$search');
  const count = query.get('$count');
  if ((search !== null || count !== null) && headers.get('consistencylevel') !== 'eventual') {
    return refuse(400, 'search.consistency', unsupported);
  }
  if (count !== null && count !== 'true' && count !== 'false') {
    return refuse(400, 'search.syntax', unsupported);
  }
  const groups = search === null ? 'syntax' : parse(search);
  if (groups === 'syntax' || search === null) return refuse(400, 'search.syntax', unsupported);
  if (groups === 'ampersand') return refuse(400, 'search.ampersand', unsupported);

  // The adapter searches, it never filters. Graph would refuse $filter on a ReadBasic token; with
  // User.Read.All it would run it, but the fake implements no $filter, so it is a 400 there.
  if (query.has('$filter')) {
    return full ? refuse(400, 'search.filter', unsupported) : refuse(403, 'search.filter', denied);
  }
  const select = query.has('$select') ? (query.get('$select') ?? '').split(',') : [...PROPERTIES];
  if (!select.every((p): p is Property => (PROPERTIES as readonly string[]).includes(p))) {
    return refuse(400, 'search.select', unsupported);
  }
  const topText = query.get('$top');
  const top = topText === null ? DEFAULT_TOP : /^\d+$/.test(topText) ? Number(topText) : 0;
  if (top < 1 || top > MAX_TOP) return refuse(400, 'search.top', unsupported);

  host.searches.push(search);
  const found = host.users.filter((u) => groups.some((g) => g.every((c) => matches(u, c))));
  const body = {
    ...(count === 'true' && { '@odata.count': found.length }),
    value: found
      .slice(0, top)
      .map((u) => Object.fromEntries(select.map((p) => [p, u[p as Property]]))),
  };
  return host.play(init, body);
}
