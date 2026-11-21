import { useEffect, useRef, useState } from 'react';
import { compareDates, parseIsoDate, parseWallTime, toIsoDate, toIsoTime } from '@/domain/time';
import { organizerOnOneLine, organizerPhrase, participantsAgenda } from '@/domain/cs';
import { futureBullet } from '@/document/compose/future';
import { POINT_LIMITS } from '@/domain/report';
import { createWith, fromText, go, toText, useStore } from '../core/react';
import * as Q from '../core/select';
import * as A from '../core/ops';
import type { Future } from '../core/types';
import { ADDRESSES, App, TitleField, Back, Left, Desk, Dialog, goReplace, Ic, Note, Rework, Saved, Seg, Sec, SheetPicker, Stamp, Todo, Top, Track, TrailMore, WHEN, type Said } from './ui';
import { futureLine, NotFound } from './home';
import { organizerPicks } from '../core/organizer';
import { loadChunk } from '../core/import/chunk';
import { NO_NAMES, SHEET_HINT, tooManyNames } from '../core/import/messages';

const CAMPUS = [['smichov', 'Smíchov'], ['radlice', 'Radlice'], ['na-vidouli', 'Na Vidouli'], ['jinde', 'Jinde']] as const;
/** Místo says where within the chosen areál, so it waits for one. */
const PLACE_NEEDS_CAMPUS = 'Nejdřív vyberte areál.';
const ROLES = [['organizes', 'Organizuje'], ['coordinates', 'Koordinuje']] as const;
const time = (x: string) => { if (!x) return null; try { return parseWallTime(x); } catch { return null; } };
/** The wizard step that asks a part a return named (ADR 0058). */
const STEP_OF: Record<string, string> = { title: 'nazev', when: 'kdy', place: 'kde', who: 'kdo', note: 'poznamka' };
const whenText = (f: Future) => `${Q.dm(f.date)}${f.endDate ? `–${Q.dm(f.endDate)}` : ''}${f.timeFrom ? ` v ${toIsoTime(f.timeFrom)}` : ''}`;
function Line({ f }: { f: Future }) {
  const text = (futureBullet(Q.futureSnap(f) as never) as unknown as { runs: { text: string }[] }).runs[0]!.text;
  return <p className="ln0">{'\u2022 '}{f.dateSet === false ? <><span className="nw" data-ph="den" />, {text.split(', ').slice(1).join(', ')}</> : text}</p>;
}
function AkceDesk({ f }: { f: Future }) {
  return <Desk cls="tall wzd" note={<b>Takhle to vyjde v dokumentu</b>}><div className="wrapm wrapn"><div className="arch"><div className="t">Porada vedení školy</div><div className="s">Pokyny pro zaměstnance, organizační záležitosti</div><div className="bl cur live"><span className="h">{f.kind === 'akce' ? 'Zatím známé akce' : 'Zatím známá jednání'}</span><Line f={f} /></div></div></div></Desk>;
}
const namesAdded = (added: number, present: number) => (added ? `Přidali jsme ${Q.counts(added, 'jméno', 'jména', 'jmen')}.` : 'Všechna jména ze souboru už v poli jsou.') + (added && present ? ` ${present >= 2 && present <= 4 ? 'Byla' : 'Bylo'} tam už ${Q.counts(present, 'jméno', 'jména', 'jmen')}.` : '');
/** Účastníci from a spreadsheet, appended to what is typed (ADR 0077). The reader loads on first use; nothing of the file is kept. */
function NamesFromFile({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const latest = useRef(value); useEffect(() => { latest.current = value; });
  const read = async (f: File): Promise<Said> => {
    const { appendNames, asText, readPeople } = await loadChunk(() => import('../core/import/participants'));
    const names = (await readPeople(f, new DOMParser())).map(asText);
    if (!names.length) return { err: true, t: NO_NAMES };
    const r = appendNames(latest.current, names, POINT_LIMITS.participants); // the person may have typed while the file was read
    if ('tooLong' in r) return { err: true, t: tooManyNames(r.tooLong, POINT_LIMITS.participants) };
    if (r.added) onChange(r.text);
    return { err: false, t: namesAdded(r.added, r.present) };
  };
  return <SheetPicker read={read} hint={SHEET_HINT} />;
}
/** New akce or jednání: one question at a time, the line in the document beside it. */
export function NovaAkce({ id, step }: { id: string; step?: string }) {
  const { s, apply } = useStore(); const f = s.futures.find((x) => x.id === id); const [del, setDel] = useState(false);
  if (!f || f.authorId !== s.userId) return <NotFound />;
  if (f.state !== 'draft' && f.state !== 'returned') { if (location.hash.includes('/nova-akce/')) goReplace(`/akce/${id}`); return null; }
  const head = Q.me(s)?.role === 'headmaster';
  const steps = ['nazev', 'kdy', 'kde', 'kdo', 'poznamka', 'hotovo']; const k = Math.max(0, steps.indexOf(step ?? 'nazev')); const cur = steps[k]!;
  const set = (p: Partial<Future>) => apply(A.saveFuture(id, p)); const stepTitle = f.kind === 'akce' ? 'Nová akce' : 'Nové jednání';
  // A run of days has no hours: the times go as soon as the last day is after the first.
  const days = (p: Partial<Future>) => { const a = p.date ?? f.date; const b = p['endDate' as keyof Future] === undefined ? f.endDate : p.endDate; set(b && compareDates(b, a) > 0 ? { ...p, timeFrom: null, timeTo: null } : p); };
  const multi = !!f.endDate && compareDates(f.endDate, f.date) > 0;
  let ask = '', help = '', body = null as React.ReactNode, can = true, hint = '', nx = 'Pokračovat';
  if (cur === 'nazev') { ask = f.kind === 'akce' ? 'Jak se akce jmenuje?' : 'O jaké jednání jde?'; can = !!f.title.trim(); hint = 'Napište název.'; body = <label className="l"><span className="vh">Název</span><TitleField autoFocus value={f.title} onChange={(v) => set({ title: v })} onEnter={() => { if (f.title.trim()) go(`/nova-akce/${id}/kdy`); }} placeholder={f.kind === 'akce' ? 'Například: Workshop 3D tisku' : 'Například: jednání s partnery z Microsoftu'} /></label>; }
  if (cur === 'kdy') { ask = 'Kdy to bude?'; help = multi ? 'Na více dní se čas nepíše.' : 'Čas je nepovinný. Podle něj poznáme, kdy Vás požádat o zprávu.'; { const bad = Q.dateProblem(s, f); can = !bad; hint = bad ?? ''; } body = <div className="stack"><div className="two"><label className="l">Den<input className="in bigi" type="date" value={f.dateSet === false ? '' : toIsoDate(f.date)} onChange={(e) => (e.target.value ? days({ date: parseIsoDate(e.target.value), dateSet: true }) : set({ dateSet: false }))} /></label><label className="l">Poslední den<small>Nepovinné</small><input className="in bigi" type="date" value={f.endDate ? toIsoDate(f.endDate) : ''} onChange={(e) => days({ endDate: e.target.value ? parseIsoDate(e.target.value) : null })} /></label></div>{multi ? null : <div className="two"><label className="l">Od<small>Nepovinné</small><input className="in bigi" type="time" value={f.timeFrom ? toIsoTime(f.timeFrom).padStart(5, '0') : ''} onChange={(e) => set({ timeFrom: time(e.target.value) })} /></label><label className="l">Do<small>Nepovinné</small><input className="in bigi" type="time" value={f.timeTo ? toIsoTime(f.timeTo).padStart(5, '0') : ''} onChange={(e) => set({ timeTo: time(e.target.value) })} /></label></div>}</div>; }
  if (cur === 'kde') { ask = 'Kde to bude?'; help = 'Nepovinné. Když to nevíte, přeskočte.'; nx = f.campus || f.place.trim() ? 'Pokračovat' : 'Přeskočit'; body = <div className="stack"><Seg label="Areál" value={f.campus} options={CAMPUS} onChange={(v) => set({ campus: v })} /><label className="l">Místo<small>{f.campus ? 'Nepovinné, například učebna S206' : PLACE_NEEDS_CAMPUS}</small><input className="in bigi" maxLength={POINT_LIMITS.place} autoCapitalize="none" value={f.place} disabled={!f.campus} onChange={(e) => set({ place: e.target.value })} /></label></div>; }
  // Staff see their colleagues as they type the last name; a pick writes the finished phrase and the field stays free text (ADR 0060, 0072 item 7).
  const orgPicks = cur === 'kdo' ? organizerPicks(s.cards, organizerOnOneLine(f.organizer), POINT_LIMITS.organizer) : [];
  if (cur === 'kdo') { ask = 'Kdo to organizuje a kdo se zúčastní?'; help = 'Nepovinné.'; nx = f.organizer.trim() || f.participants.trim() ? 'Pokračovat' : 'Přeskočit'; { const bad = f.organizer.trim() && !f.organizerRole; const pb = Q.participantsProblem(f); can = !bad && !pb; hint = bad ? 'Vyberte, jestli organizuje, nebo koordinuje.' : pb ?? ''; } body = <div className="stack"><div className="stack st6"><span className="lb">Organizátor</span><Seg label="Organizátor" value={f.organizerRole} options={ROLES} onChange={(v) => set({ organizerRole: v })} /><label className="l"><span className="vh">Jména organizátorů</span><small>Jména oddělte čárkou, například zástupkyně paní Jana Nováková</small><TitleField max={POINT_LIMITS.organizer} value={organizerOnOneLine(f.organizer)} onChange={(v) => set({ organizer: v })} onEnter={() => { if (orgPicks.length === 1) set({ organizer: orgPicks[0]!.text }); }} /></label>{orgPicks.length ? <div className="picks">{orgPicks.map((x) => <button type="button" className="pick" key={x.card.id} onClick={() => set({ organizer: x.text })}><b>{x.card.givenName} {x.card.familyName}</b><span>{Q.userById(s, x.card.id)?.affiliation ? `${Q.userById(s, x.card.id)?.affiliation}, ` : ''}ze školního adresáře</span></button>)}</div> : null}</div><label className="l">Účastníci<small>{f.kind === 'akce' ? 'Nepovinné, například Tereza Malá (3.B), Jan Novák (2.A). Jména oddělte čárkou, vypíšou se přesně tak, jak je napíšete.' : 'Nepovinné. Vypíše se přesně tak, jak to napíšete.'}</small><textarea className="in big" maxLength={POINT_LIMITS.participants} value={f.participants} onChange={(e) => set({ participants: e.target.value })} /><Left max={POINT_LIMITS.participants} value={f.participants} /></label><NamesFromFile value={f.participants} onChange={(v) => set({ participants: v })} />{f.kind === 'akce' && f.participants.trim() ? <div className="stack st6"><span className="lb">Oslovení účastníků</span><Seg label="Oslovení účastníků" value={f.participantsAddress} options={ADDRESSES} onChange={(v) => set({ participantsAddress: v })} /></div> : null}</div>; }
  if (cur === 'poznamka') { ask = 'Chcete k tomu ještě něco připsat?'; help = 'Nepovinné, například téma nebo kdo píše texty. Vypíše se přesně tak, jak to napíšete.'; nx = f.remark.trim() ? 'Pokračovat' : 'Přeskočit'; body = <label className="l"><span className="vh">Poznámka</span><textarea className="in big" autoFocus maxLength={POINT_LIMITS.futureNote} value={f.remark} onChange={(e) => set({ remark: e.target.value })} /><Left max={POINT_LIMITS.futureNote} value={f.remark} /></label>; }
  if (cur === 'hotovo') { ask = head ? 'Takhle to vyjde. Zařadíme to?' : 'Takhle to vyjde. Můžeme to poslat?'; help = head ? 'Jde to rovnou do porady, bez schvalování.' : f.kind === 'akce' ? 'Po schválení akci uvidí celá škola. Až skončí, připomeneme Vám zprávu.' : 'Po schválení se objeví v poradě. Zprávu po jednání nepíšete.'; nx = head ? 'Zařadit do porady' : 'Odeslat vedení'; { const bad = f.organizer.trim() && !f.organizerRole; const pb = Q.participantsProblem(f); can = !bad && !pb; hint = bad ? 'U organizátora vyberte, jestli organizuje, nebo koordinuje.' : pb ?? ''; } body = <div className="anss">{([['Název', f.title, 'nazev'], ['Kdy', whenText(f), 'kdy'], ['Kde', [CAMPUS.find((c) => c[0] === f.campus)?.[1], f.place.trim()].filter(Boolean).join(', '), 'kde'], ['Kdo', [organizerPhrase(f.organizerRole, f.organizer), participantsAgenda(f.kind === 'akce' ? f.participantsAddress : null, f.participants)].filter(Boolean).join(', '), 'kdo'], ['Poznámka', f.remark.trim(), 'poznamka']] as const).filter(([t, v]) => v || t === 'Název' || t === 'Kdy').map(([t, v, to]) => <div className="ans" key={t}><span className="tx"><span className="st">{t}</span><span className="tt">{v}</span></span><a className="btn" href={`#/nova-akce/${id}/${to}`} aria-label={`Změnit: ${t}`}>Změnit</a></div>)}</div>; }
  const nav = (x?: string) => go(x ? `/nova-akce/${id}/${x}` : '/');
  const it = f.kind === 'akce' ? 'akci' : 'jednání';
  const confirm = del ? <Dialog title={`Smazat ${f.state === 'returned' ? 'vrácen' : 'rozepsan'}${f.kind === 'akce' ? 'ou' : 'é'} ${it}?`} onClose={() => setDel(false)}><p>Smaže se i všechno, co jste napsali, a vrátit to nepůjde.</p><div className="row"><button type="button" className="btn lg" onClick={() => setDel(false)}>Nechat</button><button type="button" className="btn dk lg" onClick={() => { apply(A.withdrawFuture(id)); goReplace('/'); }}>Smazat</button></div></Dialog> : null;
  return <App nar noNav over={confirm} col={<>
    <div className="wzh"><a className="q" href="#/">Odejít, rozepsané zůstane uložené</a>{f.wasApproved ? null : <button type="button" className="q r" onClick={() => setDel(true)}>Smazat {it}</button>}</div>
    <p className="stn">{stepTitle}, krok {k + 1} z {steps.length}</p><div className="steps" role="img" aria-label={`Krok ${k + 1} z ${steps.length}`}>{steps.map((_, j) => <span key={j} className={j <= k ? 'on' : ''} />)}</div>
    <div className="top"><h1 className="ask">{ask}</h1>{help ? <p className="lead">{help}</p> : null}</div>{f.state === 'returned' ? <Rework labels={Q.partLabels(f, f.parts)} note={f.note} /> : null}{body}
    <div className="pv"><p className="pvh">Takhle to vyjde</p><div className="arch"><Line f={f} /></div></div>
  </>} dock={<div className="dock">{!can && hint ? <p className="hint a">{hint}</p> : null}<div className="row wzb"><button type="button" className="btn lg" onClick={() => nav(steps[k - 1])}><Ic n="back" />Zpět</button><button type="button" className={`btn lg ${can ? 'go' : 'off'}`} aria-disabled={!can} onClick={() => { if (!can) return; if (cur === 'hotovo') { apply(A.submitFuture(id)); if (head) apply(A.approveFuture(id)); goReplace(`/akce/${id}?fresh=1`); } else nav(steps[k + 1]); }}>{nx}</button></div><Saved /></div>} desk={<AkceDesk f={f} />} />;
}
/** „Zamítnout zrušení“: the akce stays approved and its author learns why, so the note is required (ADR 0062). */
export function RefuseCancel({ onClose, onDone }: { onClose: () => void; onDone: (note: string) => void }) {
  const [n, set] = useState(''); const ok = !!n.trim();
  return <Dialog title="Zamítnout zrušení" onClose={onClose}>
    <label className="l">Co má autor vědět<small>Akce zůstane schválená.</small><textarea className="in" autoFocus value={n} onChange={(e) => set(e.target.value)} placeholder="Proč akce zůstává" /></label>
    <button type="button" className={`btn lg w ${ok ? 'dk' : 'off'}`} aria-disabled={!ok} onClick={() => ok && onDone(n.trim())}>Zamítnout zrušení</button>
  </Dialog>;
}
/** Everyone's view of an akce; its author and vedení get their own moves. */
export function AkceDetail({ id, fresh }: { id: string; fresh?: boolean }) {
  const { s, apply } = useStore(); const f = s.futures.find((x) => x.id === id); const u = Q.me(s);
  const [edit, setEdit] = useState(false); const [draft, setDraft] = useState<Partial<Future>>({}); const [cancel, setCancel] = useState(false); const [refuse, setRefuse] = useState(false);
  if (!f) return <NotFound />;
  const mine = f.authorId === u?.id; const staff = Q.atLeast(u?.role, 'reviewer');
  const v = { ...f, ...draft };
  if ((f.state === 'draft' || f.state === 'returned') && mine && !fresh && !edit && f.state === 'draft') { go(`/nova-akce/${id}`); return null; }
  const pending = f.cancelRequested; const asks = mine && !staff;
  const noun = f.kind === 'akce' ? 'akce' : 'jednání', cancelLabel = f.kind === 'akce' ? 'Zrušit akci' : 'Zrušit jednání';
  const on = f.state === 'approved' ? 2 : f.state === 'submitted' ? 1 : 0;
  const stamp = { submitted: 'U vedení', approved: 'Schváleno', returned: 'Vráceno', rejected: 'Zamítnuto', cancelled: 'Zrušeno', draft: 'Rozepsáno', withdrawn: 'Zrušeno' }[f.state];
  const over = cancel ? (asks
    ? <Dialog title="Požádat o zrušení?" onClose={() => setCancel(false)}><p>Zrušení musí schválit vedení. Do té doby {noun} platí a zůstává v poradě.</p><div className="row"><button className="btn lg" onClick={() => setCancel(false)}>Nechat</button><button className="btn dk lg" onClick={() => { apply(A.requestCancelFuture(id)); setCancel(false); }}>Požádat o zrušení</button></div></Dialog>
    : <Dialog title={`${cancelLabel}?`} onClose={() => setCancel(false)}><p>{Q.cap(noun)} zmizí z přehledu školy a z porady. Zrušení nejde vrátit.</p><div className="row"><button className="btn lg" onClick={() => setCancel(false)}>Nechat</button><button className="btn dk lg" onClick={() => { apply(A.cancelFuture(id)); setCancel(false); }}>{pending ? 'Potvrdit zrušení' : cancelLabel}</button></div></Dialog>)
    : refuse ? <RefuseCancel onClose={() => setRefuse(false)} onDone={(n) => { apply(A.refuseCancelFuture(id, n)); setRefuse(false); }} /> : null;
  return <App nar over={over}
    desk={<Desk cls="tall" note={<b>Takhle to vyjde</b>}><div className="wrapm wrapn"><div className="arch-wrap rise"><Stamp t={stamp} /><div className="arch"><div className="t">Porada vedení školy</div><div className="s">Pokyny pro zaměstnance, organizační záležitosti</div><div className="bl me"><span className="h">{f.kind === 'akce' ? 'Zatím známé akce' : 'Zatím známá jednání'}</span><Line f={v} /></div></div></div></div></Desk>}
    col={<>
      <Back to={mine ? '/moje' : '/akce'} t={mine ? 'Zpět na přehled' : 'Zpět na akce'} />
      <Top h={!fresh ? Q.cap(f.title) : f.state === 'approved' ? 'Hotovo, je to v poradě' : 'Hotovo, je to u vedení'} lead={!fresh ? `${[whenText(f), organizerPhrase(f.organizerRole, f.organizer)].filter(Boolean).join(', ')}. ${futureLine(f)}.` : f.state === 'approved' ? 'Datum určí, ve kterém seznamu to vyjde.' : `Po schválení ${f.kind === 'akce' ? 'ji' : 'ho'} uvidí celá škola.`} />
      {f.state === 'returned' ? <Rework labels={Q.partLabels(f, f.parts)} note={f.note} /> : f.note ? <Note h="Poznámka vedení">{f.note}</Note> : null}
      {mine && f.cancelRefusal ? <Note h="Vedení zrušení zamítlo">{f.cancelRefusal}</Note> : null}
      {f.state === 'approved' && pending && (mine || staff) ? <Note h="Zrušení čeká na vedení">Do rozhodnutí {noun} dál platí a zůstává v poradě.</Note> : null}
      {mine && f.state !== 'cancelled' && f.state !== 'rejected' ? <Track on={on} steps={['Napsáno', 'U vedení', f.kind === 'akce' ? 'Vidí ji škola' : 'Vidí ho škola', f.kind === 'akce' ? 'Zpráva po akci' : 'V poradě']} /> : null}
      {edit ? <div className="stack"><label className="l">Název<input className="in" maxLength={POINT_LIMITS.title} value={v.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></label><label className="l">Den<input className="in" type="date" value={toIsoDate(v.date)} onChange={(e) => e.target.value && setDraft({ ...draft, date: parseIsoDate(e.target.value) })} /></label><div className="stack st6"><span className="lb">Areál</span><Seg label="Areál" value={v.campus} options={CAMPUS} onChange={(c) => setDraft({ ...draft, campus: c })} /></div><label className="l">Místo{v.campus ? null : <small>{PLACE_NEEDS_CAMPUS}</small>}<input className="in" maxLength={POINT_LIMITS.place} autoCapitalize="none" value={v.place} disabled={!v.campus} onChange={(e) => setDraft({ ...draft, place: e.target.value })} /></label><Note>{mine ? `Změna ${f.kind === 'akce' ? 'schválené akce' : 'schváleného jednání'} jde znovu ke kontrole vedení. Do té doby ${noun} dál platí v původní podobě.` : 'Upravíte to za autora, ke kontrole se to nevrací.'}</Note><div className="row"><button className="btn lg" onClick={() => { setEdit(false); setDraft({}); }}>Zpět</button><button className="btn go lg" onClick={() => { apply(A.reviseFuture(id, draft)); setEdit(false); setDraft({}); }}>Uložit změny</button></div></div> : null}
      {!edit ? <div className="stack st8">
        {fresh ? <a className="btn go lg w" href={u?.role === 'headmaster' ? '#/pridat' : '#/'}>{u?.role === 'headmaster' ? 'Přidat další' : 'Zpět domů'}</a> : null}
        {f.state === 'returned' && mine ? <a className="btn go lg w" href={`#/nova-akce/${id}/${STEP_OF[Q.returnPartsOf(f).find(([c]) => f.parts?.includes(c))?.[0] ?? ''] ?? 'hotovo'}`}>Opravit a poslat znovu</a> : null}
        {f.state === 'submitted' && mine ? <button className="btn lg w" onClick={() => { apply(A.retractFuture(id)); go(`/nova-akce/${id}/hotovo`); }}>Vzít zpět a upravit</button> : null}
        {f.state === 'approved' && u?.role === 'headmaster' ? <button type="button" className="btn lg w" onClick={() => { const nid = createWith(apply, s, (cb) => A.createFuture(f.kind, cb)); apply(A.saveFuture(nid, { title: f.title, timeFrom: f.timeFrom, timeTo: f.timeTo, campus: f.campus, place: f.place, organizer: f.organizer, organizerRole: f.organizerRole, participants: f.participants, participantsAddress: f.participantsAddress, remark: f.remark })); go(`/nova-akce/${nid}/kdy`); }}>Stejné na jiný den</button> : null}
        {f.state === 'approved' && (staff || (mine && !pending)) ? <button className="btn lg w" onClick={() => setEdit(true)}>Změnit</button> : null}
        {f.state === 'approved' && asks && pending ? <button className="q r" onClick={() => apply(A.retractCancelFuture(id))}>Vzít žádost zpět</button> : null}
        {f.state === 'approved' && (staff || (asks && !pending)) ? <button className="q r" onClick={() => setCancel(true)}>{staff && pending ? 'Potvrdit zrušení' : cancelLabel}</button> : null}
        {f.state === 'approved' && staff && pending ? <button className="q r" onClick={() => setRefuse(true)}>Zamítnout zrušení</button> : null}
      </div> : null}
      {mine && f.trail.length ? <Sec h="Co se dělo"><Todo rows={f.trail.map((t) => ({ k: 'd' as const, t: <>{t.what}, {WHEN(t.at)}<TrailMore labels={Q.partLabels(f, t.parts)} note={t.note} /></> }))} /></Sec> : null}
    </>} />;
}
export function Navrh({ id }: { id: string }) {
  const { s, apply } = useStore(); const p = s.points.find((x) => x.id === id); const [del, setDel] = useState(false);
  if (!p || p.authorId !== s.userId) return <NotFound />;
  const c = p.content; const set = (x: Partial<typeof c>) => apply(A.savePoint(id, { ...c, ...x }));
  const editable = p.state === 'draft' || p.state === 'returned';
  const can = !!c.title.trim() && !!toText(c.body).trim();
  return <App nar col={<>
    <Back to="/moje" t="Zpět na přehled" />
    <Top h={editable ? 'Co navrhujete?' : c.title} lead={editable ? 'Napište to tak, jak to má stát v dokumentu. Po schválení to ředitel zařadí na správné místo.' : p.state === 'submitted' ? 'Návrh je u kontroly.' : p.state === 'approved' ? 'Schváleno. Ředitel ho zařadí do dokumentu.' : p.state === 'published' ? 'Vyšlo v poradě.' : p.note ?? ''} />
    {p.state === 'returned' ? <Rework labels={Q.partLabels(p, p.parts)} note={p.note} /> : null}
    {editable ? <div className="stack"><div className="stack st6"><span className="lb">Kam to patří</span><Seg label="Kam to patří" value={p.kind as 'finance' | 'pokyn'} options={[['finance', 'Hospodaření'], ['pokyn', 'Pokyny']]} onChange={(v) => apply(A.retype(id, { kind: v }))} /></div><label className="l">Název<TitleField autoFocus value={c.title} onChange={(v) => set({ title: v })} /></label><label className="l">Text<textarea className="in big" value={toText(c.body)} onChange={(e) => set({ body: fromText(e.target.value) })} /></label><button type="button" className="q r" onClick={() => setDel(true)}>Smazat návrh</button></div> : null}
    {p.state === 'submitted' ? <button className="btn lg w" onClick={() => apply(A.retractPoint(id))}>Vzít zpět a upravit</button> : null}
  </>} over={del ? <Dialog title={p.state === 'returned' ? 'Smazat vrácený návrh?' : 'Smazat rozepsaný návrh?'} onClose={() => setDel(false)}><p>Smaže se i všechno, co jste napsali, a vrátit to nepůjde.</p><div className="row"><button type="button" className="btn lg" onClick={() => setDel(false)}>Nechat</button><button type="button" className="btn dk lg" onClick={() => { apply(A.withdrawPoint(id)); goReplace('/moje'); }}>Smazat</button></div></Dialog> : null}
    dock={editable ? <div className="dock">{!can ? <p className="hint a">Napište název a text.</p> : null}<div className="row"><button className={`btn lg ${can ? 'go' : 'off'}`} aria-disabled={!can} onClick={() => { if (can) { apply(A.submitPoint(id)); go('/moje'); } }}>Odeslat ke kontrole</button></div><Saved /></div> : undefined}
    desk={<Desk cls="tall wzd" note={<b>Takhle to vyjde v dokumentu</b>}><div className="wrapm wrapn"><div className="arch"><div className="s">{p.kind === 'finance' ? 'Informace z hospodaření' : 'Pokyny pro zaměstnance, organizační záležitosti'}</div><div className="bl cur live"><span className="h">{c.title || <span className="nw" data-ph="Název" />}</span><p>{toText(c.body) || <span className="nw" data-ph="Text návrhu" />}</p></div></div></div></Desk>} />;
}
