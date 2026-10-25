import { directorySearchResponse, type DirectoryHit } from '@/contracts';
import {
  foldForSearch,
  formatName,
  matchesWordPrefixes,
  searchWords,
  splitFullName,
} from '@/domain/cs';
import type { RecentPerson } from '@/domain/people';
import { DIRECTORY_LIMITS, type DraftPerson } from '@/domain/report';
import { people } from '@/ui/copy';

/** Whether the school directory is searched at all (`DIRECTORY=off` is `off`). */
export type Directory = 'on' | 'off';

/** What the notice beside the box says; one at a time. */
export type Notice = 'off' | 'down' | 'rate-limited' | 'signed-out';

/** The recents an empty box lists. */
const RECENTS_SHOWN = 8;
/** Quiet time after the last keystroke before the route is asked. */
export const DEBOUNCE_MS = 300;
/** A rate limit with no usable `Retry-After` is waited out this long. */
const DEFAULT_WAIT_MS = 5_000;
/** The route limits per minute: a longer wait is a bad header, not a rule. */
const MAX_WAIT_SECONDS = 60;

/**
 * The recents the box lists. An empty box lists the newest eight; any text lists
 * every recent in which each word typed starts some word of the given name or
 * surname, ignoring case and diacritics (the rule of Graph's `$search` and the
 * dev adapter). The newest come first.
 */
export function matchRecents(recents: readonly RecentPerson[], text: string): RecentPerson[] {
  const newest = [...recents].sort((a, b) => b.lastUsed.localeCompare(a.lastUsed));
  const wanted = searchWords(text);
  if (wanted.length === 0) return newest.slice(0, RECENTS_SHOWN);
  return newest.filter((person) =>
    matchesWordPrefixes(wanted, searchWords(`${person.givenName} ${person.familyName}`)),
  );
}

/** Whether the route is asked: not when the directory is off, nor before the shortest useful query. */
export function shouldSearch(text: string, directory: Directory): boolean {
  return directory === 'on' && text.trim().length >= DIRECTORY_LIMITS.minQuery;
}

/**
 * Which request may still show its answer: the latest one, once. `issued`
 * counts every request so an id is never reused; `current` is the one in
 * flight that may land, or null.
 */
export interface Ledger {
  readonly issued: number;
  readonly current: number | null;
}

export const IDLE_LEDGER: Ledger = { issued: 0, current: null };

/** A new request; every older one is stale from now on. */
export function begin(ledger: Ledger): { readonly ledger: Ledger; readonly id: number } {
  const id = ledger.issued + 1;
  return { ledger: { issued: id, current: id }, id };
}

/** Nothing in flight may land (a request was aborted, or the box closed). */
export function cancel(ledger: Ledger): Ledger {
  return { ...ledger, current: null };
}

/** The ledger after the answer of request `id` landed, or null when it is stale and dropped. */
export function land(ledger: Ledger, id: number): Ledger | null {
  return ledger.current === id ? { ...ledger, current: null } : null;
}

/** How long to wait before the next request: the debounce, or until a rate limit has passed. */
export function searchDelay(now: number, blockedUntil: number): number {
  return Math.max(DEBOUNCE_MS, blockedUntil - now);
}

/** What the route's answer means for the box. */
export interface Answer {
  readonly hits: readonly DirectoryHit[];
  readonly notice: Notice | null;
  /** No new request before this many milliseconds (rate limits only). */
  readonly waitMs: number;
}

const answer = (notice: Notice | null, hits: readonly DirectoryHit[] = [], waitMs = 0): Answer => ({
  hits,
  notice,
  waitMs,
});

/** `Retry-After` in whole seconds, held to 1..60, else the default wait. */
function waitOf(retryAfter: string | null): number {
  if (retryAfter === null || !/^\d+$/.test(retryAfter)) return DEFAULT_WAIT_MS;
  return Math.min(Math.max(Number(retryAfter), 1), MAX_WAIT_SECONDS) * 1000;
}

/**
 * The route's HTTP answer as hits and a notice (design section 4): 401 is
 * signed out, 429 is rate-limited for the `Retry-After` seconds, any other
 * status or a body the contract refuses is down. A 200 carries the hits, or
 * the directory's own notice: off stays off, throttled is rate-limited, and
 * unavailable, timeout and denied are all down (the reader can do nothing
 * about which).
 */
export function answerOf(response: {
  readonly status: number;
  readonly retryAfter: string | null;
  readonly body: unknown;
}): Answer {
  if (response.status === 401) return answer('signed-out');
  if (response.status === 429) return answer('rate-limited', [], waitOf(response.retryAfter));
  if (response.status !== 200) return answer('down');
  const parsed = directorySearchResponse.safeParse(response.body);
  if (!parsed.success) return answer('down');
  const { hits, notice } = parsed.data;
  if (notice === undefined) return answer(null, hits);
  if (notice === 'off') return answer('off');
  if (notice === 'throttled') return answer('rate-limited', [], DEFAULT_WAIT_MS);
  return answer('down');
}

/**
 * The hits to list after a newer answer: the answer itself, but a hit the
 * reader has focused stays where it was even when the answer dropped it, so a
 * late answer never pulls the option from under the arrow keys.
 */
export function mergeHits(
  current: readonly DirectoryHit[],
  incoming: readonly DirectoryHit[],
  focused: string | null,
): readonly DirectoryHit[] {
  const at = current.findIndex((hit) => hit.graphId === focused);
  const pinned = at < 0 ? undefined : current[at];
  if (pinned === undefined || incoming.some((hit) => hit.graphId === pinned.graphId)) {
    return incoming;
  }
  return [...incoming.slice(0, at), pinned, ...incoming.slice(at)];
}

/** What the box shows of the directory: hits to list and the notice beside the box. */
export interface Shown {
  readonly hits: readonly DirectoryHit[];
  readonly notice: Notice | null;
}

/** The last answer that landed, with the text it answered. */
export interface Found extends Shown {
  readonly query: string;
}

export const NOTHING_FOUND: Found = { hits: [], notice: null, query: '' };

/** The notices that outlast a search: they hold until an answer says otherwise. */
const isSticky = (notice: Notice | null): boolean =>
  notice === 'signed-out' || notice === 'rate-limited';

/**
 * Whether an answer to `query` still says something about `text`: the text was
 * typed on from the query, or backed off from it (every hit of a longer query
 * is a hit of its start). Another text is a new search, and what was found for
 * the old one is not shown for it.
 */
function answers(query: string, text: string): boolean {
  const answered = foldForSearch(query.trim());
  const typed = foldForSearch(text.trim());
  return answered !== '' && (typed.startsWith(answered) || answered.startsWith(typed));
}

/** The hits of the last answer that a newer answer for `text` may merge with. */
export function carriedHits(found: Found, text: string): readonly DirectoryHit[] {
  return answers(found.query, text) ? found.hits : [];
}

/**
 * What to show for the text now: the last answer while it answers this text,
 * else no hits and only the notices that outlast a search. The same when the
 * text is too short to search or the directory is off.
 */
export function foundFor(found: Found, text: string, directory: Directory): Shown {
  if (shouldSearch(text, directory) && answers(found.query, text)) return found;
  return { hits: [], notice: isSticky(found.notice) ? found.notice : null };
}

/** Hits not already listed as a recent: only a shared directory id proves two are one person. */
export function withoutShown(
  hits: readonly DirectoryHit[],
  shown: readonly RecentPerson[],
): DirectoryHit[] {
  const ids = new Set(shown.flatMap((person) => (person.graphId ? [person.graphId] : [])));
  return hits.filter((hit) => !ids.has(hit.graphId));
}

/** A typed name: split as best it can, the salutation left for the author to pick. */
export function manualPerson(text: string): DraftPerson {
  return { ...splitFullName(text.trim(), 'pan'), salutation: null };
}

/** A recent as the author last wrote it; when it was used and its genitive stay behind. */
export function personOfRecent(recent: RecentPerson): DraftPerson {
  const { lastUsed: _lastUsed, genitive: _genitive, ...person } = recent;
  return person;
}

/** A directory hit: the id (dedupe only) and the two names, nothing else is known. */
export function personOfHit(hit: DirectoryHit): DraftPerson {
  return {
    graphId: hit.graphId,
    salutation: null,
    givenName: hit.givenName,
    familyName: hit.familyName,
  };
}

/** What is said after an add; `count` is the people in the field before it. */
export function addedMessage(person: DraftPerson, count: number): string {
  const name = [person.givenName, person.familyName].filter(Boolean).join(' ');
  return people.search.added(name, count + 1);
}

/** One option's text: the name as lists write it, and the class or organisation in brackets. */
export function optionLabel(person: DraftPerson): string {
  // The salutation does not show in a name; formatName only asks for one.
  const name = formatName({ ...person, salutation: person.salutation ?? 'pan' });
  return person.affiliation ? `${name} (${person.affiliation})` : name;
}
