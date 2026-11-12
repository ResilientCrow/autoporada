import { useState } from 'react';
import { parseIsoDate, parseWallTime, toIsoDate, toIsoTime } from '@/domain/time';
import { futureBullet } from '@/document/compose/future';
import { displayName } from '@/domain/report';
import { createWith, fromText, go, Sheet, toText, useStore } from '../core/react';
import * as Q from '../core/select';
import * as A from '../core/ops';
import type { Future } from '../core/types';
import { App, TitleField, Back, Desk, Dialog, goReplace, Ic, Note, Rework, Saved, Seg, Sec, Stamp, Todo, Top, Track, TrailMore, WHEN } from './ui';
import { futureLine, NotFound } from './home';
import { PeoplePick, PersonRow } from './write';

const CAMPUS = [['smichov', 'Smíchov'], ['radlice', 'Radlice'], ['na-vidouli', 'Na Vidouli'], ['jinde', 'Jinde']] as const;
const time = (x: string) => { if (!x) return null; try { return parseWallTime(x); } catch { return null; } };
/** The wizard step that asks a part a return named (ADR 0058). */
const STEP_OF: Record<string, string> = { title: 'nazev', when: 'kdy', place: 'kde', responsible: 'kdo' };
const VERB = { organizuje: 'Organizuje', koordinuje: 'Koordinuje', 'zajišťuje': 'Zajišťuje', vede: 'Vede' } as const;
const whenText = (f: Future) => `${Q.dm(f.date)}${f.endDate ? `–${Q.dm(f.endDate)}` : ''}${f.timeFrom ? ` v ${toIsoTime(f.timeFrom)}` : ''}`;
function Line({ f }: { f: Future }) {
  const text = (futureBullet(Q.futureSnap(f) as never) as unknown as { runs: { text: string }[] }).runs[0]!.text;
  return <p className="ln0">{'\u2022 '}{f.dateSet === false ? <><span className="nw" data-ph="den" />, {text.split(', ').slice(1).join(', ')}</> : text}</p>;
}
function AkceDesk({ f }: { f: Future }) {
  return <Desk cls="tall wzd" note={<b>Takhle to vyjde v dokumentu</b>}><div className="wrapm wrapn"><div className="arch"><div className="t">Porada vedení školy</div><div className="s">Pokyny pro zaměstnance, organizační záležitosti</div><div className="bl cur live"><span className="h">{f.kind === 'akce' ? 'Zatím známé akce' : 'Zatím známá jednání'}</span><Line f={f} /></div></div></div></Desk>;
}
/** New akce or jednání: one question at a time, the line in the document beside it. */
export function NovaAkce({ id, step }: { id: string; step?: string }) {
  const { s, apply } = useStore(); const f = s.futures.find((x) => x.id === id); const [del, setDel] = useState(false);
  if (!f || f.authorId !== s.userId) return <NotFound />;
  if (f.state !== 'draft' && f.state !== 'returned') { if (location.hash.includes('/nova-akce/')) goReplace(`/akce/${id}`); return null; }
  const head = Q.me(s)?.role === 'headmaster';
  // A date with nobody behind it (holidays): a jednání, because an akce owes a report and this has nobody to write one.
  const term = head && f.kind === 'jednani' && !f.responsible.people.length && step !== 'kdo' && step !== 'kde';
  const steps = term ? ['nazev', 'kdy', 'hotovo'] : ['nazev', 'kdy', 'kde', 'kdo', 'hotovo']; const k = Math.max(0, steps.indexOf(step ?? 'nazev')); const cur = steps[k]!;
  const set = (p: Partial<Future>) => apply(A.saveFuture(id, p)); const noun = term ? 'termín' : f.kind === 'akce' ? 'akce' : 'schůzka';
  let ask = '', help = '', body = null as React.ReactNode, can = true, hint = '', nx = 'Pokračovat';
  if (cur === 'nazev') { ask = term ? 'Co je to za termín?' : f.kind === 'akce' ? 'Jak se akce jmenuje?' : 'O jakou schůzku jde?'; can = !!f.title.trim(); hint = 'Napište název.'; body = <label className="l"><span className="vh">Název</span><TitleField autoFocus value={f.title} onChange={(v) => set({ title: v })} onEnter={() => { if (f.title.trim()) go(`/nova-akce/${id}/kdy`); }} placeholder={term ? 'Například: podzimní prázdniny' : f.kind === 'akce' ? 'Například: Workshop 3D tisku' : 'Například: jednání s partnery z Microsoftu'} /></label>; }
  if (cur === 'kdy') { ask = 'Kdy to bude?'; help = 'Čas je nepovinný. Podle něj poznáme, kdy vás požádat o zprávu.'; { const bad = Q.dateProblem(s, f); can = !bad; hint = bad ?? ''; } body = <div className="stack"><div className="two"><label className="l">Den<input className="in bigi" type="date" value={f.dateSet === false ? '' : toIsoDate(f.date)} onChange={(e) => (e.target.value ? set({ date: parseIsoDate(e.target.value), dateSet: true }) : set({ dateSet: false }))} /></label><label className="l">Poslední den<small>Nepovinné</small><input className="in bigi" type="date" value={f.endDate ? toIsoDate(f.endDate) : ''} onChange={(e) => set({ endDate: e.target.value ? parseIsoDate(e.target.value) : null })} /></label></div><div className="two"><label className="l">Od<small>Nepovinné</small><input className="in bigi" type="time" value={f.timeFrom ? toIsoTime(f.timeFrom).padStart(5, '0') : ''} onChange={(e) => set({ timeFrom: time(e.target.value) })} /></label><label className="l">Do<small>Nepovinné</small><input className="in bigi" type="time" value={f.timeTo ? toIsoTime(f.timeTo).padStart(5, '0') : ''} onChange={(e) => set({ timeTo: time(e.target.value) })} /></label></div></div>; }
  if (cur === 'kde') { ask = 'Kde to bude?'; body = <div className="stack"><Seg label="Areál" value={f.campus} options={CAMPUS} onChange={(v) => set({ campus: v })} /><label className="l">Místo<small>Nepovinné, například učebna S206</small><input className="in bigi" value={f.place} onChange={(e) => set({ place: e.target.value })} /></label></div>; }
  if (cur === 'kdo') { ask = 'Kdo to má na starosti?'; help = 'Předvyplnili jsme vás. Po skončení akce požádáme o zprávu autora.'; can = f.responsible.people.length > 0 && f.responsible.people.every((p) => p.salutation); hint = f.responsible.people.length ? 'U každého vyberte oslovení.' : 'Musí tu být aspoň jeden člověk.'; body = <div className="stack"><Seg label="Co dělá" value={f.responsible.verb} options={Object.entries(VERB) as never} onChange={(v) => set({ responsible: { ...f.responsible, verb: v } })} /><ul className="prs">{f.responsible.people.map((p, i) => <PersonRow key={i} p={p} onChange={(x) => set({ responsible: { ...f.responsible, people: f.responsible.people.map((y, j) => (j === i ? x : y)) } })} onRemove={() => set({ responsible: { ...f.responsible, people: f.responsible.people.filter((_, j) => j !== i) } })} />)}</ul><PeoplePick list={[...f.responsible.people]} placeholder="Například: Tereza Malá (3.B)" onAdd={(x) => set({ responsible: { ...f.responsible, people: [...f.responsible.people, ...x] } })} /></div>; }
  if (cur === 'hotovo') { ask = head ? 'Takhle to vyjde. Zařadíme to?' : 'Takhle to vyjde. Můžeme to poslat?'; help = head ? 'Jde to rovnou do porady, bez schvalování.' : f.kind === 'akce' ? 'Po schválení akci uvidí celá škola. Až skončí, připomeneme vám zprávu.' : 'Po schválení se objeví v poradě. Zprávu po schůzce nepíšete.'; nx = head ? 'Zařadit do porady' : 'Odeslat vedení'; body = <div className="anss">{([['Název', f.title, 'nazev'], ['Kdy', whenText(f), 'kdy'], ['Kde', `${CAMPUS.find((c) => c[0] === f.campus)?.[1] ?? ''}${f.place ? `, ${f.place}` : ''}`, 'kde'], ['Kdo', f.responsible.people.map(displayName).join(', '), 'kdo']] as const).filter(([t]) => !term || (t !== 'Kde' && t !== 'Kdo')).map(([t, v, to]) => <div className="ans" key={t}><span className="tx"><span className="st">{t}</span><span className="tt">{v}</span></span><a className="btn" href={`#/nova-akce/${id}/${to}`} aria-label={`Změnit: ${t}`}>Změnit</a></div>)}</div>; }
  const nav = (x?: string) => go(x ? `/nova-akce/${id}/${x}` : '/');
  const it = term ? 'termín' : f.kind === 'akce' ? 'akci' : 'schůzku';
  const confirm = del ? <Dialog title={`Smazat ${f.state === 'returned' ? 'vrácen' : 'rozepsan'}${term ? 'ý' : 'ou'} ${it}?`} onClose={() => setDel(false)}><p>Smaže se i všechno, co jste napsali, a vrátit to nepůjde.</p><div className="row"><button type="button" className="btn lg" onClick={() => setDel(false)}>Nechat</button><button type="button" className="btn dk lg" onClick={() => { apply(A.withdrawFuture(id)); goReplace('/'); }}>Smazat</button></div></Dialog> : null;
  return <App nar noNav over={confirm} col={<>
    <div className="wzh"><a className="q" href="#/">Odejít, rozepsané zůstane uložené</a>{f.wasApproved ? null : <button type="button" className="q r" onClick={() => setDel(true)}>Smazat {it}</button>}</div>
    <p className="stn">{term ? 'Nový' : 'Nová'} {noun}, krok {k + 1} z {steps.length}</p><div className="steps" role="img" aria-label={`Krok ${k + 1} z ${steps.length}`}>{steps.map((_, j) => <span key={j} className={j <= k ? 'on' : ''} />)}</div>
    <div className="top"><h1 className="ask">{ask}</h1>{help ? <p className="lead">{help}</p> : null}</div>{f.state === 'returned' ? <Rework labels={Q.partLabels(f, f.parts)} note={f.note} /> : null}{body}
    <div className="pv"><p className="pvh">Takhle to vyjde</p><div className="arch"><Line f={f} /></div></div>
  </>} dock={<div className="dock">{!can && hint ? <p className="hint a">{hint}</p> : null}<div className="row wzb"><button type="button" className="btn lg" onClick={() => nav(steps[k - 1])}><Ic n="back" />Zpět</button><button type="button" className={`btn lg ${can ? 'go' : 'off'}`} aria-disabled={!can} onClick={() => { if (!can) return; if (cur === 'hotovo') { apply(A.submitFuture(id)); if (head) apply(A.approveFuture(id)); goReplace(`/akce/${id}?fresh=1`); } else nav(steps[k + 1]); }}>{nx}</button></div><Saved t={`Uloženo v ${Q.clock(f.savedAt).time}`} /></div>} desk={<AkceDesk f={f} />} />;
}
/** Everyone's view of an akce; its author and vedení get their own moves. */
export function AkceDetail({ id, fresh }: { id: string; fresh?: boolean }) {
  const { s, apply } = useStore(); const f = s.futures.find((x) => x.id === id); const u = Q.me(s);
  const [edit, setEdit] = useState(false); const [draft, setDraft] = useState<Partial<Future>>({}); const [cancel, setCancel] = useState(false);
  if (!f) return <NotFound />;
  const mine = f.authorId === u?.id; const staff = Q.atLeast(u?.role, 'reviewer');
  const v = { ...f, ...draft };
  if ((f.state === 'draft' || f.state === 'returned') && mine && !fresh && !edit && f.state === 'draft') { go(`/nova-akce/${id}`); return null; }
  const on = f.state === 'approved' ? 2 : f.state === 'submitted' ? 1 : 0;
  const stamp = { submitted: 'U vedení', approved: 'Schváleno', returned: 'Vráceno', rejected: 'Zamítnuto', cancelled: 'Zrušeno', draft: 'Rozepsáno', withdrawn: 'Zrušeno' }[f.state];
  return <App nar over={cancel ? <Dialog title="Zrušit akci?" onClose={() => setCancel(false)}><p>Akce zmizí z přehledu školy a z porady. Zrušení nejde vrátit.</p><div className="row"><button className="btn lg" onClick={() => setCancel(false)}>Nechat</button><button className="btn dk lg" onClick={() => { apply(A.cancelFuture(id)); setCancel(false); }}>Zrušit akci</button></div></Dialog> : null}
    desk={<Desk cls="tall" note={<b>Takhle to vyjde</b>}><div className="wrapm wrapn"><div className="arch-wrap rise"><Stamp t={stamp} /><div className="arch"><div className="t">Porada vedení školy</div><div className="s">Pokyny pro zaměstnance, organizační záležitosti</div><div className="bl me"><span className="h">{f.kind === 'akce' ? 'Zatím známé akce' : 'Zatím známá jednání'}</span><Line f={v} /></div></div></div></div></Desk>}
    col={<>
      <Back to={mine ? '/moje' : '/akce'} t={mine ? 'Zpět na Moje' : 'Zpět na akce'} />
      <Top h={!fresh ? Q.cap(f.title) : f.state === 'approved' ? 'Hotovo, je to v poradě' : 'Hotovo, je to u vedení'} lead={!fresh ? `${[whenText(f), f.responsible.people.map(displayName).join(', ')].filter(Boolean).join(', ')}. ${futureLine(f)}.` : f.state === 'approved' ? 'Datum určí, ve kterém seznamu to vyjde.' : 'Po schválení ji uvidí celá škola.'} />
      {f.state === 'returned' ? <Rework labels={Q.partLabels(f, f.parts)} note={f.note} /> : f.note ? <Note h="Poznámka vedení">{f.note}</Note> : null}
      {mine && f.state !== 'cancelled' && f.state !== 'rejected' ? <Track on={on} steps={['Napsáno', 'U vedení', 'Vidí ji škola', f.kind === 'akce' ? 'Zpráva po akci' : 'V poradě']} /> : null}
      {edit ? <div className="stack"><label className="l">Název<input className="in" value={v.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></label><label className="l">Den<input className="in" type="date" value={toIsoDate(v.date)} onChange={(e) => e.target.value && setDraft({ ...draft, date: parseIsoDate(e.target.value) })} /></label><label className="l">Místo<input className="in" value={v.place} onChange={(e) => setDraft({ ...draft, place: e.target.value })} /></label><Note>{mine ? 'Změna schválené akce jde znovu ke kontrole vedení. Do té doby akce dál platí v původní podobě.' : 'Upravíte to za autora, ke kontrole se to nevrací.'}</Note><div className="row"><button className="btn lg" onClick={() => { setEdit(false); setDraft({}); }}>Zpět</button><button className="btn go lg" onClick={() => { apply(A.reviseFuture(id, draft)); setEdit(false); setDraft({}); }}>Uložit změny</button></div></div> : null}
      {!edit ? <div className="stack st8">
        {fresh ? <a className="btn go lg w" href={u?.role === 'headmaster' ? '#/pridat' : '#/'}>{u?.role === 'headmaster' ? 'Přidat další' : 'Zpět domů'}</a> : null}
        {f.state === 'returned' && mine ? <a className="btn go lg w" href={`#/nova-akce/${id}/${STEP_OF[Q.returnPartsOf(f).find(([c]) => f.parts?.includes(c))?.[0] ?? ''] ?? 'hotovo'}`}>Opravit a poslat znovu</a> : null}
        {f.state === 'submitted' && mine ? <button className="btn lg w" onClick={() => { apply(A.retractFuture(id)); go(`/nova-akce/${id}/hotovo`); }}>Vzít zpět a upravit</button> : null}
        {f.state === 'approved' && u?.role === 'headmaster' ? <button type="button" className="btn lg w" onClick={() => { const nid = createWith(apply, s, (cb) => A.createFuture(f.kind, cb)); apply(A.saveFuture(nid, { title: f.title, timeFrom: f.timeFrom, timeTo: f.timeTo, campus: f.campus, place: f.place, responsible: f.responsible })); go(`/nova-akce/${nid}/kdy`); }}>Stejné na jiný den</button> : null}
        {f.state === 'approved' && (mine || staff) ? <button className="btn lg w" onClick={() => setEdit(true)}>Změnit</button> : null}
        {f.state === 'approved' && (mine || staff) ? <button className="q r" onClick={() => setCancel(true)}>Zrušit akci</button> : null}
      </div> : null}
      {mine && f.trail.length ? <Sec h="Co se dělo"><Todo rows={f.trail.map((t) => ({ k: 'd' as const, t: <>{t.what}, {WHEN(t.at)}<TrailMore labels={Q.partLabels(f, t.parts)} note={t.note} /></> }))} /></Sec> : null}
    </>} />;
}
export function Navrh({ id }: { id: string }) {
  const { s, apply } = useStore(); const p = s.points.find((x) => x.id === id);
  if (!p || p.authorId !== s.userId) return <NotFound />;
  const c = p.content; const set = (x: Partial<typeof c>) => apply(A.savePoint(id, { ...c, ...x }));
  const editable = p.state === 'draft' || p.state === 'returned';
  const can = !!c.title.trim() && !!toText(c.body).trim();
  return <App nar col={<>
    <Back to="/moje" t="Zpět na Moje" />
    <Top h={editable ? 'Co navrhujete?' : c.title} lead={editable ? 'Napište to tak, jak to má stát v dokumentu. Po schválení to ředitel zařadí na správné místo.' : p.state === 'submitted' ? 'Návrh je u kontroly.' : p.state === 'approved' ? 'Schváleno. Ředitel ho zařadí do dokumentu.' : p.state === 'published' ? 'Vyšlo v poradě.' : p.note ?? ''} />
    {p.state === 'returned' ? <Rework labels={Q.partLabels(p, p.parts)} note={p.note} /> : null}
    {editable ? <div className="stack"><div className="stack st6"><span className="lb">Kam to patří</span><Seg label="Kam to patří" value={p.kind as 'finance' | 'pokyn'} options={[['finance', 'Hospodaření'], ['pokyn', 'Pokyny']]} onChange={(v) => apply(A.retype(id, { kind: v }))} /></div><label className="l">Název<TitleField autoFocus value={c.title} onChange={(v) => set({ title: v })} /></label><label className="l">Text<textarea className="in big" value={toText(c.body)} onChange={(e) => set({ body: fromText(e.target.value) })} /></label></div> : null}
    {p.state === 'submitted' ? <button className="btn lg w" onClick={() => apply(A.retractPoint(id))}>Vzít zpět a upravit</button> : null}
  </>} dock={editable ? <div className="dock">{!can ? <p className="hint a">Napište název a text.</p> : null}<div className="row"><button className={`btn lg ${can ? 'go' : 'off'}`} aria-disabled={!can} onClick={() => { if (can) { apply(A.submitPoint(id)); go('/moje'); } }}>Odeslat ke kontrole</button></div><Saved t={`Uloženo v ${Q.clock(p.savedAt).time}`} /></div> : undefined}
    desk={<Desk cls="tall wzd" note={<b>Takhle to vyjde v dokumentu</b>}><div className="wrapm wrapn"><div className="arch"><div className="s">{p.kind === 'finance' ? 'Informace z hospodaření' : 'Pokyny pro zaměstnance, organizační záležitosti'}</div><div className="bl cur live"><span className="h">{c.title || <span className="nw" data-ph="Název" />}</span><p>{toText(c.body) || <span className="nw" data-ph="Text návrhu" />}</p></div></div></div></Desk>} />;
}
export { Sheet };
