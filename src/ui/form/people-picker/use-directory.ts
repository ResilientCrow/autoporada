'use client';

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

import { DIRECTORY_LIMITS } from '@/domain/report';

import {
  answerOf,
  begin,
  cancel,
  carriedHits,
  foundFor,
  IDLE_LEDGER,
  land,
  mergeHits,
  NOTHING_FOUND,
  searchDelay,
  shouldSearch,
  type Directory,
  type Found,
  type Ledger,
  type Shown,
} from './directory-state';

/** What the route answered, before the contract reads it: the status, `Retry-After` and the JSON body. */
export interface RawAnswer {
  readonly status: number;
  readonly retryAfter: string | null;
  readonly body: unknown;
}

/** Asks for people by name. The default asks the route; the gallery passes an invented one. */
export type DirectoryFetcher = (query: string, signal: AbortSignal) => Promise<RawAnswer>;

const SEARCH_URL = '/api/adresar/hledat';

/** `POST /api/adresar/hledat` with the session cookie; the text is capped as the route caps it. */
const searchRoute: DirectoryFetcher = async (query, signal) => {
  const response = await fetch(SEARCH_URL, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ q: query.slice(0, DIRECTORY_LIMITS.query) }),
    signal,
  });
  const body: unknown = response.status === 200 ? await response.json().catch(() => null) : null;
  return { status: response.status, retryAfter: response.headers.get('retry-after'), body };
};

/** A failed request (no connection): the box treats it like any other answer it cannot use. */
const NETWORK_FAILED: RawAnswer = { status: 0, retryAfter: null, body: null };

/**
 * Searches the school directory for what is typed: 300 ms after the last
 * keystroke, one request at a time (a new one aborts the old one), the latest
 * request wins, and nothing is asked before a rate limit has passed. `focused`
 * holds the directory id of the hit the reader has focused, which a newer
 * answer must not pull away. Hits and notice are those of the last answer only
 * while it answers the text (typed on from it or backed off from it); for any
 * other text, or one too short to search, the hits are empty and only a
 * signed-out or rate-limited notice stays.
 */
export function useDirectory({
  text,
  directory,
  fetcher = searchRoute,
  focused,
}: {
  readonly text: string;
  readonly directory: Directory;
  readonly fetcher?: DirectoryFetcher;
  readonly focused: RefObject<string | null>;
}): Shown {
  const [found, setFound] = useState<Found>(NOTHING_FOUND);
  const ledger = useRef<Ledger>(IDLE_LEDGER);
  const controller = useRef<AbortController | null>(null);
  const blockedUntil = useRef(0);
  // Read at call time: an inline fetcher would otherwise change `run` on every
  // render, and each landed answer would start the same search again.
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  }, [fetcher]);

  const abort = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    ledger.current = cancel(ledger.current);
  }, []);

  const run = useCallback(
    async (query: string) => {
      abort();
      const started = begin(ledger.current);
      ledger.current = started.ledger;
      const mine = new AbortController();
      controller.current = mine;
      const raw = await fetcherRef
        .current(query, mine.signal)
        .catch((): RawAnswer | null => (mine.signal.aborted ? null : NETWORK_FAILED));
      const landed = raw === null ? null : land(ledger.current, started.id);
      if (raw === null || landed === null) return;
      ledger.current = landed;
      const answer = answerOf(raw);
      if (answer.waitMs > 0) blockedUntil.current = Date.now() + answer.waitMs;
      setFound((before) => ({
        hits: mergeHits(carriedHits(before, query), answer.hits, focused.current),
        notice: answer.notice,
        query,
      }));
    },
    [abort, focused],
  );

  useEffect(() => {
    // Whatever is in flight answers an older text.
    abort();
    if (!shouldSearch(text, directory)) return undefined;
    const timer = setTimeout(
      () => void run(text.trim()),
      searchDelay(Date.now(), blockedUntil.current),
    );
    return () => clearTimeout(timer);
  }, [abort, directory, run, text]);

  useEffect(() => abort, [abort]);

  return foundFor(found, text, directory);
}
