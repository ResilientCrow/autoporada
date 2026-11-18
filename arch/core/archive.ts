import { useEffect, useState } from 'react';
import type { DocumentModel } from '@/document/model';
import { useStore } from './react';
import { issueOf } from './select';

/** A generated porada is metadata in the state; its document and the shelf are read here, on demand (`documents.read`, `documents.list`). */
type Ready = { state: 'ready'; model: DocumentModel; points: number };
type Settled = Ready | { state: 'missing' } | { state: 'failed' };
interface Shelf { points: number; titles: string[] }
type Listed = { state: 'ready'; byMonday: Map<string, Shelf> } | { state: 'failed' };
type Reply = { ok: true; data: Record<string, unknown> } | { ok: false; code: string };

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null;

/** One call of `POST /api/arch/run`; a refusal, a network error or an unreadable answer is a code, never a throw. */
async function run(fetcher: typeof fetch, name: string, input: unknown): Promise<Reply> {
  let out: unknown;
  try {
    const r = await fetcher('/api/arch/run', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, input }) });
    out = await r.json();
  } catch { return { ok: false, code: 'unavailable' }; }
  if (isObj(out) && out['ok'] === true && isObj(out['data'])) return { ok: true, data: out['data'] };
  const code = isObj(out) && isObj(out['error']) && typeof out['error']['code'] === 'string' ? out['error']['code'] : 'unavailable';
  if (code === 'unauthenticated' && typeof location !== 'undefined') location.href = '/';
  return { ok: false, code };
}

const readDocument = (d: Record<string, unknown>): Settled => (isObj(d['model']) && typeof d['points'] === 'number' ? { state: 'ready', model: d['model'] as unknown as DocumentModel, points: d['points'] } : { state: 'failed' });
function readShelf(d: Record<string, unknown>): Listed {
  const docs = d['documents'];
  if (!Array.isArray(docs)) return { state: 'failed' };
  const byMonday = new Map<string, Shelf>();
  for (const x of docs as unknown[]) {
    if (!isObj(x) || typeof x['monday'] !== 'string' || typeof x['points'] !== 'number' || !Array.isArray(x['titles'])) return { state: 'failed' };
    byMonday.set(x['monday'], { points: x['points'], titles: x['titles'].map(String) });
  }
  return { state: 'ready', byMonday };
}

/** The answers kept for the session. A generated document never changes, so the key (monday and its `at`) is all the invalidation there is; a failure is never kept. */
export function createArchive(fetcher: typeof fetch) {
  const docs = new Map<string, Settled>(); const lists = new Map<string, Listed>(); const flying = new Map<string, Promise<unknown>>();
  const known = new Map<string, Ready>(); let last = new Map<string, Shelf>();
  /** One call per key at a time; a kept answer is returned without a call. */
  const once = <T extends { state: string }>(kept: Map<string, T>, key: string, ask: () => Promise<T>): Promise<T> => {
    const done = kept.get(key); if (done) return Promise.resolve(done);
    const f = flying.get(key); if (f) return f as Promise<T>;
    const p = ask().then((r) => { if (r.state !== 'failed') kept.set(key, r); return r; }).finally(() => flying.delete(key));
    flying.set(key, p); return p;
  };
  return {
    peekDocument: (monday: string, at: string) => docs.get(`d:${monday}@${at}`),
    document: (monday: string, at: string): Promise<Settled> => once(docs, `d:${monday}@${at}`, async () => {
      const r = await run(fetcher, 'documents.read', { monday });
      const s: Settled = r.ok ? readDocument(r.data) : r.code === 'not-found' ? { state: 'missing' } : { state: 'failed' };
      if (s.state === 'ready') known.set(monday, s);
      return s;
    }),
    /** The model a screen already holds (Generate fills it before the server answers), shown until the read does. */
    remember: (monday: string, model: DocumentModel, points: number) => void known.set(monday, { state: 'ready', model, points }),
    known: (monday: string) => known.get(monday),
    peekList: (key: string) => lists.get(`l:${key}`),
    list: (key: string): Promise<Listed> => once(lists, `l:${key}`, async () => {
      const r = await run(fetcher, 'documents.list', {});
      const l: Listed = r.ok ? readShelf(r.data) : { state: 'failed' };
      if (l.state === 'ready') last = l.byMonday;
      return l;
    }),
    /** The shelf of the last list read, for the moments a newer one is on its way. */
    lastList: () => last,
  };
}

const archive = createArchive((...a) => fetch(...a));

export type Archived = { state: 'loading' } | Ready | { state: 'missing' } | { state: 'failed'; retry: () => void };
/** The document of one generated porada: the model the state holds right after Generate, else one read per monday and version. */
export function useArchived(m: string): Archived {
  const { s } = useStore();
  const doc = issueOf(s, m)?.doc; const at = doc?.at; const model = doc?.model as DocumentModel | undefined; const points = doc?.points ?? 0;
  const [got, setGot] = useState<{ key: string; r: Settled } | null>(null); const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!at) return;
    if (model) { archive.remember(m, model, points); return; }
    let live = true;
    void archive.document(m, at).then((r) => { if (live) setGot({ key: `${m}@${at}`, r }); });
    return () => { live = false; };
  }, [m, at, model, points, tick]);
  if (!at) return { state: 'missing' };
  if (model) return { state: 'ready', model, points };
  const r = archive.peekDocument(m, at) ?? (got?.key === `${m}@${at}` ? got.r : undefined);
  if (r?.state === 'ready' || r?.state === 'missing') return r;
  if (r?.state === 'failed') return { state: 'failed', retry: () => { setGot(null); setTick((t) => t + 1); } };
  return archive.known(m) ?? { state: 'loading' };
}

/** The shelf of the archive: points and last titles of every generated porada, read again when one is generated. */
export function useArchive(): { state: 'loading' | 'ready' | 'failed'; byMonday: Map<string, Shelf> } {
  const { s } = useStore();
  const key = s.issues.filter((i) => i.status === 'generated' && i.doc).map((i) => `${i.monday}@${i.doc!.at}`).sort().join('|');
  const [got, setGot] = useState<{ key: string; r: Listed } | null>(null);
  useEffect(() => {
    if (!key) return;
    let live = true;
    void archive.list(key).then((r) => { if (live) setGot({ key, r }); });
    return () => { live = false; };
  }, [key]);
  if (!key) return { state: 'ready', byMonday: new Map() };
  const r = archive.peekList(key) ?? (got?.key === key ? got.r : undefined);
  return r?.state === 'ready' ? { state: 'ready', byMonday: r.byMonday } : { state: r ? 'failed' : 'loading', byMonday: archive.lastList() };
}
