import { useState } from 'react';
import { futureBullet } from '@/document/compose/future';
import { displayName } from '@/domain/report';
import { fromText, go, Sheet, toText, useStore } from '../core/react';
import * as Q from '../core/select';
import * as A from '../core/ops';
import type { Future, Point, User } from '../core/types';
import { App, Back, Desk, Dialog, diffWords, focusOn, Note, Sec, Top, WHEN, Toast } from './ui';
import { NotFound } from './home';
import { RefuseCancel } from './akce';

type It = { kind: 'p'; p: Point } | { kind: 'f'; f: Future } | { kind: 'ph'; h: Q.PlaceholderItem };
type S = ReturnType<typeof useStore>['s'];
const queue = (s: S, u: User): It[] => [...Q.queuePoints(s).map((p) => ({ kind: 'p' as const, p })), ...Q.queueFutures(s).map((f) => ({ kind: 'f' as const, f })), ...Q.placeholderQueue(s, u).map((h) => ({ kind: 'ph' as const, h }))];
/** A placeholder's address is `chybi-<akce id>` (ADR 0061). */
const PH = 'chybi-';
const idOf = (i: It) => (i.kind === 'p' ? i.p.id : i.kind === 'f' ? i.f.id : PH + i.h.akce.id);
const MARKER = 'Vygenerováno automaticky (zpráva nedodána)';
const days = (f: Future) => (f.endDate ? `${Q.dm(f.date)} až ${Q.dm(f.endDate)}` : Q.dm(f.date));
const STATUS_LINE = (h: Q.PlaceholderItem) => h.status === 'checked' ? 'Zkontrolováno.' : h.status === 'handed-in' ? 'Autor zprávu odevzdal, čeká na rozhodnutí.' : h.status === 'open' ? `Autor může zprávu odevzdat do ${Q.clock(h.close).full}.` : 'Termín na odevzdání zprávy minul.';
type Parts = readonly (readonly [string, string])[];

/** „Vrátit autorovi“ or „Zamítnout“: a return ticks the parts to rework and may add a note (ADR 0058); a refusal needs the note. */
function Decide({ title, placeholder, verb, parts, onClose, onDone }: { title: string; placeholder: string; verb: string; parts: Parts | null; onClose: () => void; onDone: (note: string, parts: string[]) => void }) {
  const [n, set] = useState(''); const [ticked, setTicked] = useState<string[]>([]);
  const ok = !!n.trim() || ticked.length > 0;
  const tick = (c: string, on: boolean) => setTicked(on ? [...ticked, c] : ticked.filter((x) => x !== c));
  return <Dialog title={title} onClose={onClose}>
    {parts ? <div className="stack st8" role="group" aria-label="Co upravit"><span className="lb">Co upravit</span>{parts.map(([c, l]) => <label className="chk" key={c}><input type="checkbox" checked={ticked.includes(c)} onChange={(e) => tick(c, e.target.checked)} />{l}</label>)}</div> : null}
    <label className="l">Co má autor vědět<small>{parts ? 'Nepovinné, když zaškrtnete, co upravit.' : 'Autor to dostane e-mailem.'}</small><textarea className="in" autoFocus={!parts} value={n} onChange={(e) => set(e.target.value)} placeholder={placeholder} /></label>
    <button type="button" className={`btn lg w ${ok ? 'dk' : 'off'}`} aria-disabled={!ok} onClick={() => ok && onDone(n.trim(), (parts ?? []).map(([c]) => c).filter((c) => ticked.includes(c)))}>{verb}</button>
  </Dialog>;
}
export function Kontrola({ id }: { id?: string }) {
  const { s, apply, replace } = useStore(); const u = Q.me(s)!;
  const [undo, setUndo] = useState<{ s: typeof s; to: string } | null>(null); const [dlg, setDlg] = useState<'ret' | 'rej' | 'cx' | 'rcx' | null>(null); const [edit, setEdit] = useState(false); const [tt, setTt] = useState(''); const [done, setDone] = useState(0); const [toast, setToast] = useState('');
  const [title, setTitle] = useState(''); const [body, setBody] = useState('');
  const q = queue(s, u); const decidable = q.filter((x) => (x.kind === 'p' ? Q.canDecidePoint(u, x.p) : x.kind === 'f' ? Q.canDecideFuture(u, x.f) : true));
  const lone = id?.startsWith(PH) ? Q.placeholderById(s, u, id.slice(PH.length)) : undefined;
  const cur: It | undefined = (id && q.find((x) => idOf(x) === id)) || (lone && { kind: 'ph' as const, h: lone }) || decidable[0] || q[0];
  const [phEdit, setPhEdit] = useState(false); const [phText, setPhText] = useState('');
  const [seenId, setSeenId] = useState(id);
  if (seenId !== id) { setSeenId(id); setEdit(false); setPhEdit(false); }
  if (!Q.atLeast(u.role, 'reviewer')) return <NotFound />;
  const home = '/';
  if (!cur) return <App desk={<Desk cls="mg clip" note={<b>Porada {Q.dm(Q.working(s).meetingDate)}</b>}><div className="wrapm wrapn"><Sheet built={Q.buildDoc(s, Q.workingMonday(s))} /></div></Desk>} col={<><Top big h="Všechno je rozhodnuté" lead={done ? `Právě jste rozhodli ${done === 1 ? '1 položku' : done < 5 ? `${done} položky` : `${done} položek`}. Autoři dostanou e-mail.` : 'Teď tu nic nečeká.'} /><a className="btn go lg w" href={`#${home}`}>Zpět domů</a>{u.role === 'headmaster' ? <a className="btn lg w" href="#/porada/nahled">Otevřít náhled porady</a> : null}</>} />;
  const list = <details className="qd"><summary>Celá fronta ({q.length})</summary><div className="grp">{q.map((x) => <a key={idOf(x)} className={`it qi${idOf(x) === idOf(cur) ? ' on' : ''}`} href={`#/kontrola/${idOf(x)}`}><span className="tx"><span className="tt">{x.kind === 'p' ? x.p.content.title || 'Bez názvu' : x.kind === 'f' ? x.f.title : x.h.akce.title}</span><span className="st">{x.kind === 'ph' ? `${MARKER}, ${days(x.h.akce)}` : <>{x.kind === 'p' ? (x.p.kind === 'report' ? 'Zpráva' : 'Návrh') : x.f.cancelRequested ? 'Žádost o zrušení' : x.f.changed ? (x.f.kind === 'akce' ? 'Změna akce' : 'Změna jednání') : x.f.kind === 'akce' ? 'Akce' : 'Jednání'}, {Q.nameOf(Q.userById(s, x.kind === 'p' ? x.p.authorId : x.f.authorId))}</>}</span></span></a>)}</div></details>;
  if (cur.kind === 'ph') {
    const { akce: f, monday: m, status, point } = cur.h; const chk = s.placeholderChecks[f.id]; const current = Q.placeholderText(s, f, m);
    const own = !!Q.issueOf(s, m)?.placeholders[f.id]; const moved = !chk?.checked && !!chk?.was && chk.was !== Q.systemText(f);
    const rest = decidable.filter((x) => idOf(x) !== idOf(cur));
    const confirm = () => { apply(A.confirmPlaceholder(m, f.id, Q.systemText(f))); setUndo(null); setToast(`Zkontrolováno: ${f.title}`); go(rest[0] ? `/kontrola/${idOf(rest[0])}` : '/kontrola'); };
    const phDock = phEdit ? <div className="dock"><div className="row"><button className="btn lg" onClick={() => setPhEdit(false)}>Zpět</button><button className={`btn lg ${phText.trim() ? 'go' : 'off'}`} aria-disabled={!phText.trim()} onClick={() => { if (!phText.trim()) return; apply(A.setPlaceholder(m, f.id, phText)); setPhEdit(false); }}>Uložit</button></div></div> : status === 'checked' ? undefined : <div className="dock"><div className="row"><button type="button" className="btn go lg" onClick={confirm}>Zkontrolováno</button></div></div>;
    const phOver = toast ? <Toast key={toast} onDone={() => { setToast(''); setUndo(null); }}>{toast}</Toast> : null;
    return <App nar over={phOver} dock={phDock} desk={<Desk cls="tall" note={<b>Takhle to vyjde</b>} right={<span>Porada {Q.dm(Q.issueOf(s, m)?.meetingDate ?? m)}</span>}><div className="wrapm wrapn"><Sheet built={focusOn(Q.buildDoc(s, m, { pending: true }), `missing-${f.id}`)} cls={(x) => (x.key === `missing-${f.id}` ? 'cur' : '')} /></div></Desk>}
      col={<>
        <Back to={home} t="Zpět domů" />
        {q.some((x) => idOf(x) === idOf(cur)) ? <p className="stn">{q.findIndex((x) => idOf(x) === idOf(cur)) + 1}. z {q.length} ke kontrole</p> : null}
        <Top h={f.title} lead={`${MARKER}. ${days(f)}. Autor: ${Q.nameOf(Q.userById(s, f.authorId))}.`} />
        <p className="sm">{point ? `Zpráva je ${point.state === 'submitted' ? 'u kontroly' : point.state === 'returned' ? 'vrácená autorovi' : 'rozepsaná'}. ` : 'Autor zatím nezačal. '}{STATUS_LINE(cur.h)}</p>
        {moved ? <Note h="Akce se od vaší kontroly změnila"><p className="diff">{diffWords(chk!.was!, Q.systemText(f))}</p></Note> : null}
        {phEdit ? <label className="l">Odstavec<textarea className="in big" autoFocus value={phText} onChange={(e) => setPhText(e.target.value)} /></label> : <><p className="ppar">{current}</p><div className="row wr"><button className="btn" onClick={() => { setPhText(current); setPhEdit(true); }}>Přepsat odstavec</button>{own ? <button className="q" onClick={() => apply(A.setPlaceholder(m, f.id, null))}>Vrátit původní text</button> : null}</div></>}
        {list}
      </>} />;
  }
  const after = (msg: string, undoable = true) => { setUndo(undoable ? { s, to: idOf(cur) } : null); setDone((d) => d + 1); setToast(msg); const rest = decidable.filter((x) => idOf(x) !== idOf(cur)); go(rest[0] ? `/kontrola/${idOf(rest[0])}` : '/kontrola'); };
  const idx = q.findIndex((x) => idOf(x) === idOf(cur)) + 1;
  const canDo = cur.kind === 'p' ? Q.canDecidePoint(u, cur.p) : Q.canDecideFuture(u, cur.f);
  const au = Q.userById(s, cur.kind === 'p' ? cur.p.authorId : cur.f.authorId);
  const cancelAsked = cur.kind === 'f' && cur.f.cancelRequested;
  const cancelDock = <div className="dock"><div className="row"><button type="button" className="btn go lg" onClick={() => setDlg('cx')}>Potvrdit zrušení</button></div><div className="row dec2"><button type="button" className="q r" onClick={() => setDlg('rcx')}>Zamítnout zrušení</button></div></div>;
  const dock = canDo && cancelAsked ? cancelDock : canDo ? <div className="dock"><div className="row"><button type="button" className="btn go lg" onClick={() => { const name = cur.kind === 'p' ? cur.p.content.title : cur.f.title; apply(cur.kind === 'p' ? A.approvePoint(cur.p.id) : A.approveFuture(cur.f.id)); after(`Schváleno: ${name}`); }}>Schválit</button></div><div className="row dec2"><button type="button" className="btn" onClick={() => setDlg('ret')}>Vrátit k úpravě</button>{cur.kind === 'p' ? <button type="button" className="btn" onClick={() => { setTitle(cur.p.content.title); setBody(toText(cur.p.content.body)); setTt(cur.p.content.opening); setEdit(true); }}>Upravit text</button> : null}<button type="button" className="q r" onClick={() => setDlg('rej')}>Zamítnout</button></div></div> : undefined;
  const cx = cur.kind === 'f' ? cur.f : null;
  const over = dlg === 'cx' && cx ? <Dialog title="Zrušit akci?" onClose={() => setDlg(null)}><p>Akce zmizí z přehledu školy a z porady. Zrušení nejde vrátit.</p><div className="row"><button type="button" className="btn lg" onClick={() => setDlg(null)}>Nechat</button><button type="button" className="btn dk lg" onClick={() => { apply(A.cancelFuture(cx.id)); setDlg(null); after(`Zrušeno: ${cx.title}`, false); }}>Potvrdit zrušení</button></div></Dialog>
    : dlg === 'rcx' && cx ? <RefuseCancel key={cx.id} onClose={() => setDlg(null)} onDone={(n) => { apply(A.refuseCancelFuture(cx.id, n)); setDlg(null); after('Zrušení zamítnuto', false); }} />
    : dlg === 'ret' || dlg === 'rej' ? <Decide key={`${dlg}-${idOf(cur)}`} parts={dlg === 'ret' ? Q.returnPartsOf(cur.kind === 'p' ? cur.p : cur.f) : null} title={dlg === 'ret' ? 'Vrátit autorovi' : 'Zamítnout'} verb={dlg === 'ret' ? 'Vrátit autorovi' : 'Zamítnout'} placeholder={dlg === 'ret' ? 'Například: Doplňte prosím vyjádření ředitele.' : 'Proč to nevyjde'} onClose={() => setDlg(null)} onDone={(n, parts) => { apply(cur.kind === 'p' ? (dlg === 'ret' ? A.returnPoint(cur.p.id, n, parts) : A.rejectPoint(cur.p.id, n)) : dlg === 'ret' ? A.returnFuture(cur.f.id, n, parts) : A.rejectFuture(cur.f.id, n)); setDlg(null); after(dlg === 'ret' ? 'Vráceno autorovi' : 'Zamítnuto'); }} /> : toast ? <Toast key={toast} onDone={() => { setToast(''); setUndo(null); }} {...(undo ? { undo: () => { replace(undo.s); setDone((d) => d - 1); setToast(''); setUndo(null); go(`/kontrola/${undo.to}`); } } : {})}>{toast}</Toast> : null;
  if (cur.kind === 'p') {
    const p = cur.p; const m = p.poradaMonday ?? Q.workingMonday(s);
    const b = p.kind === 'report' ? focusOn(Q.buildDoc(s, m, { draft: p }), p.id) : null;
    const orig = p.trail.filter((t) => t.original);
    const own = p.authorId === u.id && u.role !== 'headmaster';
    return <App nar over={over} dock={edit ? <div className="dock"><div className="row"><button className="btn lg" onClick={() => setEdit(false)}>Zpět</button><button className="btn go lg" onClick={() => { apply(A.editAsReviewer(p.id, { ...p.content, title, body: fromText(body), opening: tt, openingEdited: tt !== p.content.opening || p.content.openingEdited })); setEdit(false); setUndo(null); setToast('Úprava je uložená, původní znění zůstává v historii.'); }}>Uložit úpravu</button></div></div> : dock}
      desk={<Desk cls="tall" note={<b>Takhle to vyjde</b>} right={<span>{p.kind === 'report' ? `Porada ${Q.dm(Q.issueOf(s, m)?.meetingDate ?? m)}` : ''}</span>}><div className="wrapm wrapn">{b ? <Sheet built={b} cls={(x) => (x.key === p.id ? 'cur' : '')} /> : <div className="arch"><div className="s">{p.kind === 'finance' ? 'Informace z hospodaření' : 'Pokyny'}</div><div className="bl cur"><span className="h">{p.content.title}</span><p>{toText(p.content.body)}</p></div></div>}</div></Desk>}
      col={<>
        <Back to={home} t="Zpět domů" />
        <p className="stn">{idx}. z {q.length} ke kontrole</p>
        <Top h={edit ? 'Upravit text' : p.content.title} lead={edit ? 'Původní znění se uloží do historie a autor ho uvidí.' : `${p.kind === 'report' ? 'Zpráva' : p.kind === 'finance' ? 'Návrh do hospodaření' : 'Návrh do pokynů'}. Autor: ${Q.nameOf(au)}, posláno ${p.submittedAt ? WHEN(p.submittedAt) : ''}.`} />
        {own ? <Note h="Tohle je vaše zpráva">Svou zprávu si sami neschválíte. Rozhodne někdo jiný z vedení.</Note> : null}
        {edit ? <div className="stack"><label className="l">Název<input className="in" value={title} onChange={(e) => setTitle(e.target.value)} /></label>{p.kind === 'report' ? <label className="l">Úvodní věta<textarea className="in" value={tt} onChange={(e) => setTt(e.target.value)} /></label> : null}<label className="l">Text<textarea className="in big" value={body} onChange={(e) => setBody(e.target.value)} /></label></div> : null}
        {orig.map((t, i) => <Note key={i} h={`Úprava: ${Q.nameOf(Q.userById(s, t.who))}`}>{Object.entries(t.original!).map(([k, v]) => <p key={k} className="diff"><span className="sm">{k}</span><br />{k === 'Text' ? diffWords(v, toText(p.content.body)) : k === 'Název' ? diffWords(v, p.content.title) : diffWords(v, p.content.opening)}</p>)}</Note>)}
        {!edit && p.kind === 'report' ? <Sec h="Co zkontrolovat"><ul className="todo chkl">{p.content.bullets.filter((x) => x.kind !== 'people' || x.people.length).map((x) => x.kind === 'people' ? <li key={x.key}><span>{x.label}: {x.people.map(displayName).join(', ') || 'nikdo'}</span></li> : null)}{p.content.statements.map((x, i) => <li key={i}><span>Vyjádření {x.speakerGenitive}</span></li>)}</ul></Sec> : null}
        {list}
      </>} />;
  }
  const f = cur.f;
  return <App nar over={over} dock={dock} desk={<Desk cls="tall" note={<b>Takhle to vyjde</b>}><div className="wrapm wrapn"><div className="arch"><div className="s">Pokyny pro zaměstnance, organizační záležitosti</div><div className="bl cur"><span className="h">{f.kind === 'akce' ? 'Zatím známé akce' : 'Zatím známá jednání'}</span><p className="ln0">{'\u2022 '}{(futureBullet(Q.futureSnap(f) as never) as unknown as { runs: { text: string }[] }).runs[0]!.text}</p></div></div></div></Desk>} col={<>
    <Back to={home} t="Zpět domů" />
    <p className="stn">{idx}. z {q.length} ke kontrole</p>
    <Top h={f.title} lead={`${f.cancelRequested ? 'Žádost o zrušení' : f.changed ? (f.kind === 'akce' ? 'Změna schválené akce' : 'Změna schváleného jednání') : f.kind === 'akce' ? 'Nová akce' : 'Nové jednání'}, ${Q.dm(f.date)} Autor: ${Q.nameOf(au)}.`} />
    {f.cancelRequested ? <Note h="Autor žádá o zrušení akce">Do rozhodnutí akce dál platí a zůstává v poradě.</Note> : null}
    {f.changed ? <Note h="Schválená akce se změnila">Do rozhodnutí jde znovu ke kontrole.</Note> : null}
    {list}
  </>} />;
}
export function Moje2() { return null; }
