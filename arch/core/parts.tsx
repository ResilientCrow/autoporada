import { useEffect, useId, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent, type ReactNode } from 'react';
import { foldForSearch } from '@/domain/cs';
import type { Indent, RichDoc } from '@/domain/richtext';
import { shrinkToJpeg } from './image';
import { appendImported, listBytes } from './import/apply';
import { loadChunk } from './import/chunk';
import { IMPORT_HINT, ImportError, importMessage, SKIPPED_IMAGES_NOTE, TEXT_ONLY_NOTE } from './import/messages';
import { useStore } from './react';
import * as Q from './select';
import { parseTable } from './table';
import { typedLine } from './text';
import type { Annex, AnnexPart } from './types';

// ---- text with levels -------------------------------------------------------
type OLine = { lv: number; t: string };
/** Lines from Word or Excel: levels from their own indent, and the bullets go, because the document draws its own. */
const pastedLines = (raw: string): OLine[] => {
  const rows = raw.replace(/\r/g, '').split('\n').filter((x) => x.trim()).map((x) => { const ws = /^[\t \u00a0]*/.exec(x)![0]; const width = [...ws].reduce((n, ch) => n + (ch === '\t' ? 4 : 1), 0); return { width, t: x.trim().replace(/^(?:[-\u2013\u2022\u00b7*\u25a0\u25aa\u25cf]|o(?=\s))\s*/, '') }; });
  const widths = [...new Set(rows.map((r) => r.width))].sort((a, b) => a - b);
  return rows.filter((r) => r.t).map((r) => ({ lv: widths.indexOf(r.width), t: r.t }));
};
const MARK = ['', 'o', 'o', '\u25A0'];
const toLines = (v: string): OLine[] => { const r = v.split('\n').map((l) => ({ lv: Math.min(3, /^\t*/.exec(l)![0].length), t: l.replace(/^\t+/, '') })); return r.length ? r : [{ lv: 0, t: '' }]; };
const fromLines = (l: OLine[]) => l.map((x) => '\t'.repeat(x.lv) + x.t).join('\n');
/** A nested list edited as it prints: one line a row, Enter adds, Tab or the buttons move it a level. Pasting several lines splits them. */
export function OutlineField({ value, onChange, label, help }: { value: string; onChange: (v: string) => void; label: string; help?: string }) {
  const lb = useId(); const lines = useMemo(() => toLines(value), [value]); const [cur, setCur] = useState(0); const box = useRef<HTMLDivElement>(null); const want = useRef<{ i: number; at: number } | null>(null);
  useEffect(() => { if (!want.current) return; const { i, at } = want.current; want.current = null; const el = box.current?.querySelectorAll('textarea')[i]; if (el) { el.focus(); const p = at < 0 ? el.value.length : at; el.setSelectionRange(p, p); } });
  const put = (l: OLine[], focus?: { i: number; at: number }) => { if (focus) want.current = focus; onChange(fromLines(l)); };
  const level = (i: number, d: 1 | -1) => put(lines.map((x, j) => (j === i ? { ...x, lv: Math.max(0, Math.min(3, x.lv + d)) } : x)), { i, at: -1 });
  const key = (e: KeyboardEvent<HTMLTextAreaElement>, i: number) => {
    const el = e.currentTarget; const atStart = el.selectionStart === 0 && el.selectionEnd === 0; const atEnd = el.selectionStart === el.value.length;
    if (e.key === 'Tab') { e.preventDefault(); level(i, e.shiftKey ? -1 : 1); }
    else if (e.key === 'Enter') { e.preventDefault(); const c = lines[i]!; const a = c.t.slice(0, el.selectionStart), b = c.t.slice(el.selectionEnd); put([...lines.slice(0, i), { lv: c.lv, t: a }, { lv: c.lv, t: b }, ...lines.slice(i + 1)], { i: i + 1, at: 0 }); }
    else if (e.key === 'Backspace' && atStart) { if (lines[i]!.lv > 0) { e.preventDefault(); level(i, -1); } else if (i > 0) { e.preventDefault(); const p = lines[i - 1]!; put([...lines.slice(0, i - 1), { lv: p.lv, t: p.t + lines[i]!.t }, ...lines.slice(i + 1)], { i: i - 1, at: p.t.length }); } }
    else if (e.key === 'ArrowUp' && atStart && i > 0) { e.preventDefault(); want.current = { i: i - 1, at: -1 }; setCur(i - 1); }
    else if (e.key === 'ArrowDown' && atEnd && i < lines.length - 1) { e.preventDefault(); want.current = { i: i + 1, at: 0 }; setCur(i + 1); }
  };
  const paste = (e: ClipboardEvent<HTMLTextAreaElement>, i: number) => { const t = e.clipboardData.getData('text/plain'); if (!t.includes('\n')) return; e.preventDefault(); const el = e.currentTarget; const c = lines[i]!; const added = pastedLines(t).map((x) => ({ lv: Math.min(3, c.lv + x.lv), t: x.t })); added[0] = { ...added[0]!, t: c.t.slice(0, el.selectionStart) + added[0]!.t }; const n = added.length - 1; added[n] = { ...added[n]!, t: added[n]!.t + c.t.slice(el.selectionEnd) }; put([...lines.slice(0, i), ...added, ...lines.slice(i + 1)], { i: i + n, at: -1 }); };
  return <div className="ol-f" ref={box}>
    <div className="l" id={lb}>{label}<small>{help ?? 'Enter přidá řádek. Odsazený řádek je položka seznamu, další odsazení podpoložka. Odsadíte ho tlačítkem pod polem nebo klávesou Tab. Seznam z Wordu můžete rovnou vložit.'}</small></div>
    <div className="ol-rows" role="group" aria-labelledby={lb}>{lines.map((x, i) => <div key={i} className={`ol-r lv${x.lv}${i === cur ? ' on' : ''}`} style={{ paddingLeft: `${x.lv * 22}px` }}><span className="ol-m" aria-hidden="true">{MARK[x.lv]}</span><textarea rows={1} aria-label={`Řádek ${i + 1}, úroveň ${x.lv}`} value={x.t} onFocus={() => setCur(i)} onChange={(e) => put(lines.map((y, j) => (j === i ? { ...y, t: e.target.value.replace(/\n/g, ' ') } : y)))} onKeyDown={(e) => key(e, i)} onPaste={(e) => paste(e, i)} /></div>)}</div>
    <div className="row wr ol-b"><button type="button" className="btn" disabled={lines[cur]?.lv === 0} onMouseDown={(e) => e.preventDefault()} onClick={() => level(cur, -1)}>Zrušit odsazení</button><button type="button" className="btn" disabled={lines[cur]?.lv === 3} onMouseDown={(e) => e.preventDefault()} onClick={() => level(cur, 1)}>Odsadit řádek</button><button type="button" className="btn" onMouseDown={(e) => e.preventDefault()} onClick={() => put([...lines.slice(0, cur + 1), { lv: lines[cur]?.lv ?? 0, t: '' }, ...lines.slice(cur + 1)], { i: cur + 1, at: 0 })}>Přidat řádek</button></div>
  </div>;
}

// ---- rejstřík -----------------------------------------------------------------
export interface Attention { label: string; test: (i: Q.OutlineItem) => boolean }
function useCurrent(items: Q.OutlineItem[]) {
  const [cur, set] = useState<string | null>(null);
  useEffect(() => {
    const els = items.map((i) => document.getElementById(`seg-${i.key}`)).filter(Boolean) as HTMLElement[];
    if (!els.length || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((es) => { const hit = es.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]; if (hit) set(hit.target.id.slice(4)); }, { rootMargin: '-10% 0px -75% 0px' });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [items]);
  return cur;
}
const scrollToSeg = (key: string) => {
  const el = document.getElementById(`seg-${key}`); if (!el) return;
  el.scrollIntoView({ block: 'start' }); // No smooth scrolling: across 19 pages it disorients, and late layout could strand it mid-way.
  el.classList.remove('jump'); void el.offsetWidth; el.classList.add('jump');
};
/** The way around a long document: where you are, a list of all points, and what still needs you. */
export function DocNav({ built, attention, notes }: { built: Q.Built; attention?: Attention; notes?: (i: Q.OutlineItem) => ReactNode }) {
  const items = useMemo(() => Q.outlineOf(built), [built]); const [open, setOpen] = useState(false); const [q, setQ] = useState(''); const [only, setOnly] = useState(false);
  const cur = useCurrent(items); const box = useRef<HTMLDivElement>(null); const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (!open) return; const k = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); btn.current?.focus(); } }; const out = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); }; addEventListener('keydown', k); addEventListener('mousedown', out); box.current?.querySelector<HTMLElement>('.dn-cur')?.scrollIntoView({ block: 'center' }); return () => { removeEventListener('keydown', k); removeEventListener('mousedown', out); }; }, [open]);
  if (items.length < 2) return null;
  const hits = attention ? items.filter(attention.test) : [];
  const f = foldForSearch(q.trim());
  const shown = items.filter((i) => (!only || attention?.test(i)) && (!f || foldForSearch(`${i.n ?? ''} ${i.title}`).includes(f)));
  const curI = items.find((i) => i.key === cur);
  const goTo = (k: string) => { setOpen(false); scrollToSeg(k); };
  const next = () => { const at = cur ? items.findIndex((i) => i.key === cur) : -1; const n = items.slice(at + 1).find((i) => attention!.test(i)) ?? hits[0]; if (n) scrollToSeg(n.key); };
  return <div className="dnav" ref={box}>
    {attention && hits.length ? <button type="button" className="dn-nx" onClick={next}>{attention.label}: další ({hits.length})</button> : null}
    <button type="button" ref={btn} className="dn-b" aria-expanded={open} onClick={() => setOpen(!open)}>{curI?.n ? <>Bod {curI.n}<span> z {items.filter((i) => i.n).length}</span></> : curI ? 'Přílohy' : <>Body dokumentu<span> ({items.filter((i) => i.n).length})</span></>}</button>
    {open ? <div className="dn-p" role="dialog" aria-label="Body dokumentu">
      <input className="dn-q" type="search" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Hledat bod nebo číslo" aria-label="Hledat v bodech" />
      {attention && hits.length ? <label className="dn-o"><input type="checkbox" checked={only} onChange={(e) => setOnly(e.target.checked)} />Jen: {attention.label.toLowerCase()} ({hits.length})</label> : null}
      <div className="dn-l" role="list">{shown.length ? shown.map((i, k) => <div key={i.key} role="listitem">{(k === 0 || shown[k - 1]!.group !== i.group) && i.group ? <p className="dn-g">{i.group}</p> : null}<button type="button" className={`dn-i${i.key === cur ? ' dn-cur' : ''}`} onClick={() => goTo(i.key)}><b>{i.n ?? ''}</b><span>{i.title}{notes?.(i)}</span></button></div>) : <p className="dn-e">Nic takového v dokumentu není.</p>}</div>
    </div> : null}
  </div>;
}

// ---- annexes ------------------------------------------------------------------
let partSeq = 0;
const pid = () => `part-${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}-${partSeq++}`;
/** A photo straight from a phone is megabytes: shrink it before it goes anywhere. */
function readImage(file: File): Promise<{ src: string; w: number; h: number }> {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return Promise.reject(new Error('type'));
  const url = URL.createObjectURL(file);
  return shrinkToJpeg(url).finally(() => URL.revokeObjectURL(url));
}
const count = (n: number, a: string, b: string, c: string) => `${n} ${n === 1 ? a : n > 1 && n < 5 ? b : c}`;
function TablePart({ rows, onChange }: { rows: string[][]; onChange: (r: string[][]) => void }) {
  const [raw, setRaw] = useState(() => rows.map((r) => r.join('\t')).join('\n'));
  const paste = (e: ClipboardEvent<HTMLTextAreaElement>) => { const t = e.clipboardData.getData('text/plain'); if (t.includes('\t')) { e.preventDefault(); setRaw(t.trim()); onChange(parseTable(t)); } };
  const uneven = new Set(rows.map((r) => r.length)).size > 1;
  return <div className="stack st8">
    <label className="l">Tabulka<small>Zkopírujte buňky z Excelu a vložte je sem. První řádek bude záhlaví.</small><textarea className="in ax-tb" value={raw} onPaste={paste} onChange={(e) => { setRaw(e.target.value); onChange(parseTable(e.target.value)); }} /></label>
    {uneven ? <p className="sm w-err" role="alert">Některé řádky mají jiný počet sloupců. Prázdné buňky zůstanou prázdné.</p> : null}
    {rows.length ? <p className="sm">Vyjde {count(rows.length - 1, 'řádek', 'řádky', 'řádků')} a {count(Math.max(...rows.map((r) => r.length)), 'sloupec', 'sloupce', 'sloupců')}.</p> : null}
  </div>;
}
/** Keeps what is typed as typed (a trailing space, a blank line); the stored document is the cleaned version of it. */
export function TextPart({ doc, onChange }: { doc: RichDoc; onChange: (d: RichDoc) => void }) {
  const [v, set] = useState(() => annexToText(doc));
  return <OutlineField label="Text" value={v} onChange={(x) => { set(x); onChange(annexDoc(x)); }} />;
}
export function AnnexEditor({ annex, onChange, n }: { annex: Annex; onChange: (a: Annex) => void; n: number }) {
  const [err, setErr] = useState(''); const [notes, setNotes] = useState<string[]>([]); const [busy, setBusy] = useState(false); const file = useRef<HTMLInputElement>(null); const doc = useRef<HTMLInputElement>(null);
  const { s } = useStore();
  const latest = useRef(annex); const issues = useRef(s.issues); useEffect(() => { latest.current = annex; issues.current = s.issues; });
  const setPart = (id: string, p: Partial<AnnexPart>) => onChange({ ...annex, parts: annex.parts.map((x) => (x.id === id ? { ...x, ...p } as AnnexPart : x)) });
  const add = (p: AnnexPart) => onChange({ ...annex, parts: [...annex.parts, p] });
  const move = (k: number, d: -1 | 1) => { const a = [...annex.parts]; const j = k + d; if (j < 0 || j >= a.length) return; [a[k], a[j]] = [a[j]!, a[k]!]; onChange({ ...annex, parts: a }); };
  /** Reads a Word, OpenDocument or PDF file in the browser and appends what it holds as ordinary parts. The importer loads on first use. */
  const attach = async (f: File) => {
    setErr(''); setNotes([]); setBusy(true);
    try {
      const [{ importFile }, { browserDeps }] = await Promise.all([loadChunk(() => import('./import')), loadChunk(() => import('./import/browser'))]);
      const before = latest.current;
      // The save cap is on the whole list of annexes of the porada, so count all of them, this one as it is now.
      const all = issues.current.find((i) => i.annexes.some((a) => a.id === before.id))?.annexes ?? [];
      const r = await importFile(new Uint8Array(await f.arrayBuffer()), { titleEmpty: !before.title.trim(), existingBytes: listBytes(all, before) }, browserDeps());
      onChange(appendImported(latest.current, r, pid)); // the person may have typed while the file was read
      setNotes([...(r.textOnly ? [TEXT_ONLY_NOTE] : []), ...(r.skipped ? [SKIPPED_IMAGES_NOTE] : [])]);
    } catch (x) {
      const e = x instanceof ImportError ? x : new ImportError('broken');
      // Signed out or in need of a fresh sign-in: the same way the write queue goes (react.tsx).
      if (e.code === 'signed-out') { location.href = '/'; return; }
      if (e.code === 'step-up') { location.href = '/auth/step-up?returnTo=%2F'; return; }
      setErr(importMessage(e));
    } finally { setBusy(false); }
  };
  return <div className="stack ax">
    <label className="l">Název přílohy {n}<input className="in" value={annex.title} onChange={(e) => onChange({ ...annex, title: typedLine(e.target.value) })} placeholder="Například: Výsledky voleb do Studentské rady" /></label>
    {annex.parts.map((p, k) => <section className="ax-p" key={p.id} aria-label={`Část ${k + 1}`}>
      {p.kind === 'text' ? <TextPart doc={p.doc} onChange={(doc) => setPart(p.id, { doc })} /> : null}
      {p.kind === 'table' ? <TablePart rows={p.rows} onChange={(rows) => setPart(p.id, { rows })} /> : null}
      {p.kind === 'image' ? <div className="stack st8"><img className="ax-img" src={p.src} alt="" /><label className="l">Co je na obrázku<small>Přečte si to člověk, který obrázek nevidí.</small><input className="in" value={p.alt} onChange={(e) => setPart(p.id, { alt: typedLine(e.target.value) })} /></label></div> : null}
      <div className="row wr ax-a"><button type="button" className="q" disabled={k === 0} onClick={() => move(k, -1)}>Posunout výš</button><button type="button" className="q" disabled={k === annex.parts.length - 1} onClick={() => move(k, 1)}>Posunout níž</button><button type="button" className="q r" onClick={() => onChange({ ...annex, parts: annex.parts.filter((x) => x.id !== p.id) })}>Odebrat tuto část</button></div>
    </section>)}
    {err ? <p className="sm w-err" role="alert">{err}</p> : null}
    {notes.map((n) => <p key={n} className="sm" role="status">{n}</p>)}
    <div className="row wr ax-add">
      <button type="button" className="btn" onClick={() => add({ id: pid(), kind: 'text', doc: { type: 'doc', content: [] } })}>Přidat text</button>
      <button type="button" className="btn" onClick={() => add({ id: pid(), kind: 'table', rows: [] })}>Přidat tabulku</button>
      <button type="button" className="btn" onClick={() => { setErr(''); file.current?.click(); }}>Přidat obrázek nebo graf</button>
      <button type="button" className={`btn${busy ? ' off' : ''}`} disabled={busy} aria-busy={busy} onClick={() => { setErr(''); doc.current?.click(); }}>{busy ? 'Čtu soubor…' : 'Přiložit soubor'}</button>
      <input ref={doc} className="vh" type="file" accept=".docx,.doc,.odt,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword,application/vnd.oasis.opendocument.text,application/pdf" tabIndex={-1} aria-hidden="true" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void attach(f); }} />
      <input ref={file} className="vh" type="file" accept="image/png,image/jpeg,image/webp" tabIndex={-1} aria-hidden="true" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; void (async () => { try { const im = await readImage(f); add({ id: pid(), kind: 'image', ...im, alt: '' }); } catch (x) { setErr((x as Error).message === 'type' ? 'Tohle není obrázek. Vyberte soubor PNG nebo JPG. Graf z Excelu uložte jako obrázek.' : 'Obrázek se nepodařilo načíst. Zkuste ho uložit znovu a vybrat.'); } })(); }} />
    </div>
    <p className="sm">{IMPORT_HINT}</p>
  </div>;
}
/** An unindented line is a paragraph, a tabbed one a list item, one more tab a sub-item. */
export const annexDoc = (t: string): RichDoc => ({ type: 'doc', content: t.split('\n').map((l) => l.replace(/\s+$/, '')).filter(Boolean).map((l) => { const tabs = /^\t*/.exec(l)![0].length; return { type: 'paragraph' as const, attrs: { indent: Math.min(3, tabs) as Indent }, content: [{ type: 'text' as const, text: l.trimStart() }] }; }) });
export const annexToText = (d: RichDoc) => d.content.map((p) => '\t'.repeat(p.attrs.indent) + (p.content ?? []).map((x) => x.text).join('')).join('\n');
