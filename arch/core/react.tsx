import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { DocumentModel } from '@/document/model';
import { BlockView } from '@/document/render-html/PaperPreview';
import paper from '@/document/render-html/paper.module.css';
import { richDocToPlainText, type RichDoc } from '@/domain/richtext';
import * as A from './ops';
import type * as Q from './select';
import type { State } from './types';
import { rules } from '@/ui/copy/forms';

type Fx = ((s: State) => State) & { op?: A.Op };
const Ctx = createContext<{ s: State; apply: (f: Fx) => void; replace: (s: State) => void } | null>(null);
type Srv = State & { vers?: Record<string, number> };
interface Problem { code: string; name: string; rule?: string; keep?: boolean }
const PROBLEM: Record<string, string> = {
  conflict: 'Mezitím to změnil někdo jiný. Načetli jsme aktuální stav.',
  forbidden: 'Na tohle nemáte oprávnění.',
  'not-found': 'Tahle položka už neexistuje.',
  invalid: 'Server údaje nepřijal. Zkontrolujte vyplněná pole.',
  'invalid-input': 'Něco z vyplněného server nepřijal. Zkontrolujte pole a uložte znovu.',
  'too-long': 'Je to moc velké, zkuste menší obrázek.',
  busy: 'Server je zrovna zaneprázdněný. Zkuste to za chvíli.',
  rule: 'Tohle teď nejde.',
  'rate-limited': 'Moc rychle za sebou. Chvíli počkejte.',
  unauthenticated: 'Přihlášení vypršelo. Přihlaste se znovu.',
  'step-up-required': 'Tohle je citlivý krok, nejdřív ověříme, že jste to vy.',
  unavailable: 'Server teď neodpovídá. Zkuste to za chvíli.',
};

const COALESCED = new Set<string>(['savePoint', 'saveFuture', 'saveType', 'annexes']);

/** The state comes from the server; an action shows at once and goes to the server in order. */
export function StoreProvider({ children }: { ns?: string; children: ReactNode }) {
  const [s, set] = useState<State | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const cur = useRef<State | null>(null);
  const vers = useRef<Record<string, number>>({});
  const ids = useRef<Record<string, string>>({});
  const queue = useRef<A.Op[]>([]);
  const busy = useRef(false);
  const real = (id: string) => ids.current[id] ?? id;
  const writes = useRef(0); // a state read that began before a later write must not overwrite it
  const load = useCallback(async () => {
    const began = writes.current;
    const r = await fetch('/api/arch/state', { credentials: 'same-origin', cache: 'no-store', redirect: 'manual' });
    if (r.status === 401 || r.type === 'opaqueredirect') { const out = { v: 1, now: new Date().toISOString(), userId: null, users: [], types: [], points: [], futures: [], issues: [], registry: [], requests: [], settings: {}, mails: [], stepUpAt: null, seq: 0, audit: [] } as unknown as State; cur.current = out; set(out); return; }
    if (!r.ok) { setProblem({ code: 'unavailable', name: 'state' }); return; }
    const srv = (await r.json()) as Srv;
    if (queue.current.length || busy.current || began !== writes.current) return;
    vers.current = srv.vers ?? {};
    const next = A.settle(srv);
    cur.current = next; set(next);
    // Back from the sign-in: the address a mail link opened.
    try { const after = sessionStorage.getItem('arch-after-login'); if (after && next.userId) { sessionStorage.removeItem('arch-after-login'); location.hash = after; } } catch { /* soukromé okno */ }
  }, []);
  const pump = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    let keepLocal = false;
    try {
      while (queue.current.length) {
        const op = queue.current[0]!;
        // A newer save of the same thing makes this one pointless.
        const later = queue.current.slice(1).some((x) => x.k === op.k && COALESCED.has(op.k) && op.a[0] !== null && x.a[0] === op.a[0]);
        if (!later) {
          const calls = A.toCalls(op, { s: cur.current!, vers: vers.current, real });
          for (const c of calls) {
            const r = await fetch('/api/arch/run', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: c.name, input: c.input }) });
            const out = (await r.json().catch(() => ({ ok: false, error: { code: 'unavailable' } }))) as { ok: boolean; data?: Record<string, unknown>; error?: { code: string; rule?: string } };
            if (!out.ok) {
              const code = out.error?.code ?? 'unavailable';
              if (code === 'unauthenticated') { location.href = '/'; return; }
              if (code === 'step-up-required') { location.href = '/auth/step-up?returnTo=%2F'; return; }
              // Text typed into a refused save stays on the screen; only this thing's later writes go.
              keepLocal = code !== 'conflict' && COALESCED.has(op.k);
              setProblem({ code, name: c.name, ...(out.error?.rule && { rule: out.error.rule }), keep: keepLocal });
              queue.current = queue.current.filter((x, i) => i === 0 || x.a[0] !== op.a[0]);
              break;
            }
            const d = out.data ?? {};
            if (c.key && typeof d['version'] === 'number') vers.current[c.key] = d['version'];
            const made = (d['id'] ?? d['pointId'] ?? d['lineageId']) as string | undefined;
            if (c.tmp && made) {
              ids.current[c.tmp] = made;
              vers.current[made] = typeof d['version'] === 'number' ? (d['version'] as number) : 1;
              if (c.key && typeof d['version'] === 'number') vers.current[c.key] = d['version'];
              // The temporary id the screen made becomes the server's, in the state and the address.
              const renamed = JSON.parse(JSON.stringify(cur.current).replaceAll(`"${c.tmp}"`, `"${made}"`)) as State;
              cur.current = renamed; set(renamed);
              // What the screen prefilled (the author, the place) goes to the server right after.
              if (c.name === 'points.create') queue.current.splice(1, 0, { k: 'savePoint', a: [made] });
              if (c.name === 'future.create') queue.current.splice(1, 0, { k: 'saveFuture', a: [made] });
              { const h = location.hash.replace(new RegExp(`/${c.tmp}(?=/|\\?|$)`), `/${made}`); if (h !== location.hash) location.replace(h); }
            }
          }
        }
        queue.current.shift();
      }
    } finally {
      busy.current = false;
    }
    if (!keepLocal) await load();
  }, [load]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the first fetch of the server state, on mount
    void load();
    // Back to the tab: fresh clock and data. Leaving it: send what is waiting for its debounce.
    const seen = () => { if (document.visibilityState === 'visible') void load(); else void pump(); };
    document.addEventListener('visibilitychange', seen);
    return () => document.removeEventListener('visibilitychange', seen);
  }, [load, pump]);
  // The worker renders the PDF; look again until it is done.
  useEffect(() => {
    if (!s?.issues.some((i) => i.doc?.pdf === 'rendering')) return;
    const t = setTimeout(() => void load(), 3000); return () => clearTimeout(t);
  }, [s, load]);
  const v = useMemo(() => s && ({
    s,
    apply: (f: Fx) => {
      const before = cur.current!;
      const next = A.settle(f(before));
      cur.current = next; set(next);
      const op = f.op;
      if (!op || op.k === 'none') return;
      if (op.k === 'signOut') { const form = document.createElement('form'); form.method = 'post'; form.action = '/auth/logout'; if (op.a[0] === 'all') { const scope = document.createElement('input'); scope.type = 'hidden'; scope.name = 'scope'; scope.value = 'all'; form.append(scope); } document.body.append(form); form.submit(); return; }
      if (op.k === 'stepUp') { location.href = '/auth/step-up?returnTo=%2F'; return; }
      writes.current++;
      queue.current.push(op);
      const saving = COALESCED.has(op.k);
      if (saving) setTimeout(() => void pump(), 600); else void pump();
    },
    replace: (x: State) => { cur.current = x; set(x); },
  }), [s, pump]);
  // eslint-disable-next-line react-hooks/refs -- the refs are read only inside apply and replace, which run in handlers
  if (!v) return <div className="store-load" role="status" aria-live="polite">Načítám…</div>;
  return <Ctx.Provider value={v}>{problem ? <div className="store-full" role="alert">{(problem.rule && rules[problem.rule as keyof typeof rules]) || PROBLEM[problem.code] || 'Tohle se nepovedlo. Zkuste to znovu.'} <button type="button" onClick={() => { setProblem(null); if (!problem.keep) void load(); }}>Zavřít</button></div> : null}{children}</Ctx.Provider>;
}
export function useStore() { const c = useContext(Ctx); if (!c) throw new Error('no store'); return c; }
/** Runs an action that creates something and hands back its id. */
export function createWith(apply: (f: Fx) => void, _s: State, make: (cb: (id: string) => void) => Fx): string { let id = ''; apply(make((x) => (id = x))); return id; }

export interface Route { path: string; parts: string[]; q: URLSearchParams }
const read = (): Route => { const raw = location.hash.replace(/^#/, '') || '/'; const [path = '/', qs = ''] = raw.split('?'); return { path, parts: path.split('/').filter(Boolean), q: new URLSearchParams(qs) }; };
export function useRoute() {
  const [r, set] = useState(read);
  useEffect(() => { const f = () => { set(read()); window.scrollTo(0, 0); document.querySelector<HTMLElement>('[data-focus-top]')?.focus({ preventScroll: true }); }; addEventListener('hashchange', f); return () => removeEventListener('hashchange', f); }, []);
  return r;
}
export const go = (to: string) => { location.hash = to; };

/** The document, real blocks, grouped by source so a design can mark and click its parts. */
export function Sheet({ built, cls, onSeg, label, marginNote, empty }: { built: Q.Built; cls?: (s: Q.Segment) => string; onSeg?: (s: Q.Segment) => void; label?: string; marginNote?: (s: Q.Segment) => ReactNode; empty?: ReactNode }) {
  if (!built.model) return <>{empty ?? null}</>;
  return (
    <article className={`${paper['paper']} ${paper['blocks']} sheet`} aria-label={label ?? 'Dokument porady'}>
      {built.segments.map((seg) => {
        const clickable = onSeg && seg.kind !== 'head' && seg.kind !== 'tail';
        return (
          <div key={seg.key} id={`seg-${seg.key}`} className={`seg seg-${seg.kind} ${seg.state ? `st-${seg.state}` : ''} ${cls?.(seg) ?? ''}`} {...(clickable ? { role: 'button', tabIndex: 0, onClick: () => onSeg(seg), onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter') onSeg(seg); } } : {})}>
            {marginNote?.(seg)}
            {seg.blocks.map((b, i) => <BlockView key={i} block={b} />)}
          </div>
        );
      })}
    </article>
  );
}
export const SegBlocks = BlockView;
export function SavedModel({ model }: { model: DocumentModel }) { return <article className={`${paper['paper']} ${paper['blocks']} sheet`}>{model.sections.flatMap((x, si) => x.blocks.map((b, i) => <BlockView key={`${si}-${i}`} block={b} />))}</article>; }

export const toText = (d: RichDoc) => richDocToPlainText(d);
/** Keeps the spaces as typed: the domain's richDocFromText trims each line, which would swallow a space at the end while typing. */
export const fromText = (t: string): RichDoc => ({ type: 'doc', content: t.split(/\r\n|[\r\n]/).map((line) => ({ type: 'paragraph' as const, attrs: { indent: 0 as const }, ...(line && { content: [{ type: 'text' as const, text: line }] }) })) });

/** A real DOCX from the real renderer. False when nothing was saved: the viewer declined it in the Claude viewer, which offers files only through its own prompt. */
export async function downloadDocx(model: DocumentModel, name: string): Promise<boolean> {
  const { renderDocx } = await import('@/document/render-docx');
  const blob = new Blob([await renderDocx(model) as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  const claude = (window as unknown as { claude?: { use(n: 'downloads'): Promise<{ save(r: { filename: string; data: Blob }): Promise<unknown> } | null> } }).claude;
  const viewer = await claude?.use('downloads');
  if (viewer) {
    try { await viewer.save({ filename: name, data: blob }); return true; } catch (e) { if ((e as { code?: string }).code === 'declined') return false; throw e; }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
  return true;
}

/** The prototype's demo controls have no place in the real app. */
export function DemoBar() { return null; }
