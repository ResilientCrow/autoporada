import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useRoute, useStore, Sheet } from '../core/react';
import * as Q from '../core/select';
import type { Mark } from '../core/marks';
import { POINT_LIMITS } from '@/domain/report';
import { autosave } from '@/ui/copy/autosave';
import logo from './logo-dark.svg';

const I: Record<string, string> = { plus: 'M12 5v14M5 12h14', chk: 'M5 12.5l4.5 4.5L19 7.5', chev: 'M9 6l6 6-6 6', back: 'M15 6l-6 6 6 6', user: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21c1-4 4-6 8-6s7 2 8 6', x: 'M6 6l12 12M18 6L6 18', ban: 'M12 20a8 8 0 100-16 8 8 0 000 16zM6.35 6.35l11.3 11.3', up: 'M12 19V5M6 11l6-6 6 6', down: 'M12 5v14M6 13l6 6 6-6', home: 'M3 11l9-8 9 8M5 9.5V21h14V9.5', doc: 'M14 3H6v18h12V7zM14 3v4h4', rev: 'M9 12l2 2 4-4M4 4h16v16H4z', stack: 'M4 7l8-4 8 4-8 4zM4 12l8 4 8-4M4 17l8 4 8-4', gear: 'M4 7h10M18 7h2M4 17h2M10 17h10M14 5v4M6 15v4', pen: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4', cal: 'M4 6h16v15H4zM4 10h16M8 3v4M16 3v4', calp: 'M4 6h16v15H4zM4 10h16M8 3v4M16 3v4M12 13v5M9.5 15.5h5', talk: 'M4 5h16v11H10l-5 4v-4H4z', ppl: 'M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM2.5 20c.8-3.5 3.3-5 6.5-5s5.7 1.5 6.5 5M16 4.5a3.5 3.5 0 010 6.5M18 15c2 .6 3.2 2.2 3.5 5', list: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01', tag: 'M3 3h8l10 10-8 8L3 11zM7.5 7.5h.01', bell: 'M6 16v-5a6 6 0 0112 0v5l2 2H4zM10 21h4', flag: 'M5 21V4h12l-2.5 4 2.5 4H5', book: 'M4 4h6a2 2 0 012 2v15a2 2 0 00-2-2H4zM20 4h-6a2 2 0 00-2 2v15a2 2 0 012-2h6z' };
export const Ic = ({ n }: { n: keyof typeof I | string }) => <svg className="i" viewBox="0 0 24 24" aria-hidden="true"><path d={I[n]} /></svg>;
export const Hash = (to: string) => `#${to}`;

function useNav() {
  const { s } = useStore(); const u = Q.me(s);
  const q = Q.queuePoints(s).length + Q.queueFutures(s).length + Q.placeholderQueue(s, u).length;
  const req = Q.pendingRequests(s).length;
  if (u?.role === 'headmaster') return [['/', 'home', 'Domů', 0], ['/porada', 'book', 'Porada', 0], ['/kontrola', 'rev', 'Ke kontrole', q], ['/archiv', 'stack', 'Archiv', 0], ['/lide', 'gear', 'Správa', req]] as const;
  if (u?.role === 'reviewer') return [['/', 'home', 'Domů', 0], ['/kontrola', 'rev', 'Ke kontrole', q], ['/moje', 'doc', 'Přehled', 0], ['/archiv', 'stack', 'Archiv', 0]] as const;
  return [['/', 'home', 'Domů', 0], ['/tyden', 'bell', 'Čeká na Vás', 0], ['/moje', 'doc', 'Přehled', 0]] as const;
}
export function Bar() {
  const nav = useNav(); const r = useRoute();
  return (
    <>
      <header className="bar"><a className="logo" href="#/"><img src={logo} alt="Smíchovská střední, domů" /></a><a className="uu" href="#/ucet" aria-label="Můj účet"><Ic n="user" /></a></header>
      <nav className="nav" aria-label="Hlavní">{nav.map(([to, , t, n]) => { const on = r.path === to || (to !== '/' && r.path.startsWith(`${to}/`)); return <a key={to} href={Hash(to)} className={on ? 'on' : ''} {...(on ? { 'aria-current': 'page' as const } : {})}>{t}{n ? <span className="n">{n}</span> : null}</a>; })}</nav>
    </>
  );
}
/** Moves on and leaves no history entry to come back to. */
export const goReplace = (to: string) => location.replace(`#${to}`);
export function PhoneBar() {
  const nav = useNav(); const r = useRoute();
  return <nav className="pb" aria-label="Hlavní">{nav.map(([to, ic, t, n]) => { const on = r.path === to || (to !== '/' && r.path.startsWith(`${to}/`)); return <a key={to} href={Hash(to)} className={on ? 'on' : ''} {...(on ? { 'aria-current': 'page' as const } : {})}><Ic n={ic} /><span>{t}</span>{n ? <span className="n">{n}</span> : null}</a>; })}</nav>;
}
function Offline() {
  const [off, set] = useState(!navigator.onLine);
  useEffect(() => { const a = () => set(false), b = () => set(true); addEventListener('online', a); addEventListener('offline', b); return () => { removeEventListener('online', a); removeEventListener('offline', b); }; }, []);
  return off ? <div className="offl" role="status">Jste bez připojení. Co napíšete, zůstává v tomto prohlížeči.</div> : null;
}
/** The one layout of the app: the work strip and the desk with the sheet. */
export function App({ col, desk, dock, nar, full, over, noNav }: { col: ReactNode; desk?: ReactNode; dock?: ReactNode; nar?: boolean; full?: boolean; over?: ReactNode; noNav?: boolean }) {
  return (
    <div className={`lay${nar ? ' nar' : ''}${full ? ' full' : ''}`}>
      <div className="work"><Offline />{noNav ? null : <Bar />}<main className="col" tabIndex={-1} data-focus-top>{col}</main>{dock}{dock ? null : noNav ? null : <PhoneBar />}</div>
      {desk}{over}
    </div>
  );
}
/** „Zbývá 12 znaků.“ once a field nears the limit the server holds it to. */
export const Left = ({ max, value }: { max: number; value: string }) => (max - value.length < 40 ? <small role="status">{Q.charsLeft(max - value.length)}</small> : null);
/** One line that may be long (a title, names): it grows instead of hiding its start, and Enter moves on. */
export function TitleField({ value, onChange, onEnter, placeholder, autoFocus, max = POINT_LIMITS.title }: { value: string; onChange: (v: string) => void; onEnter?: () => void; placeholder?: string; autoFocus?: boolean; max?: number }) {
  return <><textarea className="in bigi ttl" rows={1} maxLength={max} {...(autoFocus ? { autoFocus } : {})} {...(placeholder ? { placeholder } : {})} value={value} onChange={(e) => onChange(e.target.value.replace(/\n/g, ' '))} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onEnter?.(); } }} /><Left max={max} value={value} /></>;
}
export function useNarrow() {
  const [n, set] = useState(() => matchMedia('(max-width:900px)').matches);
  useEffect(() => { const m = matchMedia('(max-width:900px)'); const f = () => set(m.matches); m.addEventListener('change', f); return () => m.removeEventListener('change', f); }, []);
  return n;
}
/** A long document on a phone waits behind one button: nothing is scrolled past or rendered until it is wanted. */
export function Desk({ note, children, cls = '', right, fold }: { note?: ReactNode; children?: ReactNode; cls?: string; right?: ReactNode; fold?: string }) {
  const narrow = useNarrow(); const [open, setOpen] = useState(false);
  const shut = !!fold && narrow && !open;
  return <aside className={`desk ${cls}${shut ? ' shut' : ''}`} aria-label="Dokument">{note || right ? <div className="dhd"><span>{note}</span>{shut ? null : right}</div> : null}{shut ? <button type="button" className="btn lg w on-desk" onClick={() => setOpen(true)}>{fold}</button> : children}</aside>;
}
export function Top({ h, lead, big }: { h: ReactNode; lead?: ReactNode; big?: boolean }) { return <div className="top"><h1 className={big ? 'big' : 'big m'}>{h}</h1>{lead ? <p className="lead">{lead}</p> : null}</div>; }
export const Back = ({ to, t }: { to: string; t: string }) => <a className="back" href={Hash(to)}><Ic n="back" />{t}</a>;
export const Sec = ({ h, right, children }: { h: string; right?: ReactNode; children: ReactNode }) => <section className="grp"><h2>{h}{right}</h2>{children}</section>;
/** `hot` runs when the pointer or the focus reaches the row, for a desk that follows it. */
export function Item({ to, act, t, st, mk, end, warn, hot }: { to?: string; act?: () => void; t: ReactNode; st?: ReactNode; mk?: Mark; end?: ReactNode; warn?: boolean; hot?: () => void }) {
  const inner = <>{mk ? <span className={`mk ${mk === 'c' ? '' : mk}`}>{mk === 'c' ? <Ic n="chk" /> : mk === 'z' ? <Ic n="ban" /> : <i />}</span> : null}<span className="tx"><span className="tt">{t}</span>{st ? <span className={`st${warn ? ' w' : ''}`}>{st}</span> : null}</span>{end ?? (to || act ? <span className="gl"><Ic n="chev" /></span> : null)}</>;
  const on = hot ? { onMouseEnter: hot, onFocus: hot } : {};
  if (act) return <button type="button" className="it" onClick={act} {...on}>{inner}</button>;
  return to ? <a className="it" href={Hash(to)} {...on}>{inner}</a> : <div className="it">{inner}</div>;
}
export const Note = ({ h, children, err }: { h?: string; children: ReactNode; err?: boolean }) => <div className={`note${err ? ' err' : ''}`} {...(err ? { role: 'alert' } : {})}>{h ? <b>{h}</b> : null}{children}</div>;
/** What a return asked of the author (ADR 0058): the parts to rework as the heading, the reviewer's note below. */
export function Rework({ labels, note }: { labels: readonly string[]; note: string | null }) {
  if (!labels.length) return note ? <Note h="Poznámka vedení">{note}</Note> : null;
  return <Note h={`Upravte: ${labels.join(', ')}`}>{note}</Note>;
}
/** A „Co se dělo“ line's tail: the parts a return named and the note, each on a line of its own. */
export const TrailMore = ({ labels, note }: { labels: readonly string[]; note: string | undefined }) => <>{labels.length ? <><br /><span className="sm">{`K\u00a0přepracování: ${labels.join(', ')}`}</span></> : null}{note ? <><br /><span className="sm">{note}</span></> : null}</>;
export function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const close = useRef(onClose); useEffect(() => { close.current = onClose; });
  useEffect(() => { const opener = document.activeElement as HTMLElement | null; const f = (e: KeyboardEvent) => { if (e.key === 'Escape') close.current(); }; addEventListener('keydown', f); document.querySelector<HTMLElement>('.dlg')?.focus(); return () => { removeEventListener('keydown', f); opener?.focus?.(); }; }, []);
  return <div className="veil" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}><div className="dlg" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}><div className="dh"><h2>{title}</h2><button type="button" className="x" aria-label="Zavřít" onClick={onClose}><Ic n="x" /></button></div>{children}</div></div>;
}
export function Toast({ children, onDone, undo }: { children: ReactNode; onDone?: () => void; undo?: () => void }) {
  const done = useRef(onDone); useEffect(() => { done.current = onDone; });
  useEffect(() => { const t = setTimeout(() => done.current?.(), undo ? 15000 : 5000); return () => clearTimeout(t); }, [undo]);
  return <div className="toast" role="status"><span>{children}</span>{undo ? <button type="button" onClick={undo}>Vrátit zpět</button> : null}</div>;
}
/** The footer's save status, as the store knows it: a refused save says so, never „Uloženo“. */
export function Saved() {
  const { saving } = useStore();
  if (saving === 'failed') return <span className="sv err" role="status">{autosave.unsaved}</span>;
  return <span className="sv" role="status">{saving === 'saving' ? autosave.saving : <><Ic n="chk" />Uloženo</>}</span>;
}
export function Track({ on, steps }: { on: number; steps: string[] }) {
  return <ol className="trk">{steps.map((t, k) => <li key={t} className={k < on ? 'dn' : k === on ? 'nw2' : ''} {...(k === on ? { 'aria-current': 'step' as const } : {})}><i>{k < on ? <Ic n="chk" /> : null}</i><span>{t}</span></li>)}</ol>;
}
export const Stamp = ({ t }: { t: string }) => <span className="stamp">{t}</span>;
export function Seg<T extends string>({ label, value, options, onChange }: { label: string; value: T | null; options: readonly (readonly [T, string])[]; onChange: (v: T) => void }) {
  return <div className="sgm" role="radiogroup" aria-label={label}>{options.map(([v, t]) => <button type="button" key={v} role="radio" aria-checked={value === v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>{t}</button>)}</div>;
}
export function Todo({ rows }: { rows: { k: 'd' | 'n' | 'o' | 'x'; t: ReactNode }[] }) {
  return <ul className="todo">{rows.map((r, i) => <li key={i}><span className={`mk ${r.k === 'n' ? '' : r.k === 'd' ? '' : r.k}`}>{r.k === 'd' ? <Ic n="chk" /> : <i />}</span><span>{r.t}</span></li>)}</ul>;
}
/** The sheet with only what matters while writing: the title, the section, your part. */
export function focusOn(b: Q.Built, id: string): Q.Built {
  const mine = b.segments.find((x) => x.key === id);
  const title = b.segments[0];
  const prov = b.segments.find((x) => x.kind === 'head' && x.blocks.some((k) => k.kind === 'section' && k.text.includes('PROVOZU')));
  const gap = { kind: 'spacer' } as const;
  const titleOnly = title ? { ...title, blocks: [...title.blocks.filter((k) => k.kind === 'title'), gap] } : null;
  return { ...b, segments: [titleOnly, prov && { ...prov, blocks: [...prov.blocks.filter((k) => k.kind === 'section'), gap] }, mine].filter(Boolean) as Q.Segment[] };
}
export const WHEN = (d: string | Date) => Q.clock(d).full;
export { Sheet };
export function diffWords(a: string, b: string) {
  const x = a.split(/(\s+)/), y = b.split(/(\s+)/);
  const m = x.map(() => new Array<number>(y.length + 1).fill(0)); m.push(new Array<number>(y.length + 1).fill(0));
  for (let i = x.length - 1; i >= 0; i--) for (let j = y.length - 1; j >= 0; j--) m[i]![j] = x[i] === y[j] ? m[i + 1]![j + 1]! + 1 : Math.max(m[i + 1]![j]!, m[i]![j + 1]!);
  // Mostly rewritten: word marks would be noise, so show before and after whole.
  if (m[0]![0]! / Math.max(x.length, y.length) < 0.5) return [<del key="a">{a}</del>, <br key="b" />, <ins key="c">{b}</ins>];
  const out: ReactNode[] = []; let i = 0, j = 0, k = 0;
  while (i < x.length || j < y.length) {
    if (i < x.length && j < y.length && x[i] === y[j]) { out.push(x[i]); i++; j++; }
    else if (j < y.length && (i >= x.length || m[i]![j + 1]! >= m[i + 1]![j]!)) { out.push(<ins key={k++}>{y[j]}</ins>); j++; }
    else { out.push(<del key={k++}>{x[i]}</del>); i++; }
  }
  return out;
}
