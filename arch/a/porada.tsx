import { useEffect, useMemo, useState } from 'react';
import { isDownloadError } from '@/contracts';
import { downloadFailed } from '@/ui/copy/download';
import { parseIsoDate, toIsoDate } from '@/domain/time';
import { moveBounds } from '@/domain/calendar';
import { POINT_LIMITS } from '@/domain/report';
import { emptyRichDoc, isRichDocEmpty } from '@/domain/richtext';
import { createWith, go, Sheet, useStore } from '../core/react';
import type { DocumentModel } from '@/document/model';
import * as Q from '../core/select';
import * as A from '../core/ops';
import { NotFound } from './home';
import type { Row } from '../core/types';
import { OUTLINE_LIMITS, type Statement } from '@/domain/outline';
import { AnnexEditor, annexDoc, annexToText, DocNav, OutlineField, TextPart } from '../core/parts';
import { App, Back, Desk, Dialog, goReplace, Ic, Item, Note, Sec, Seg, Stamp, Todo, Toast, Top, useNarrow, WHEN } from './ui';

const notYet = (n: number) => (n === 1 ? '1 zatím nevyjde, protože čeká na schválení' : n < 5 ? `${n} zatím nevyjdou, protože čekají na schválení` : `${n} zatím nevyjde, protože čeká na schválení`);
const useM = () => { const { s } = useStore(); return Q.workingMonday(s); };
const { counts } = Q;
const ATT = { label: 'Čeká na Vás', test: (i: Q.OutlineItem) => i.state === 'submitted' || (i.kind === 'missing' && i.state !== 'checked') };
let deskTop = 0;
function WholeDesk({ pending = true, note, focus }: { pending?: boolean; note?: string; focus?: (x: Q.Segment) => boolean }) {
  const { s } = useStore(); const m = useM(); const b = Q.buildDoc(s, m, { pending });
  const fk = focus ? b.segments.find(focus)?.key : undefined;
  // Coming back from a report lands where you left the long document, editing a point lands on that point.
  useEffect(() => { const d = document.querySelector<HTMLElement>('.desk.mg'); if (!d) return; if (fk) document.getElementById(`seg-${fk}`)?.scrollIntoView({ block: 'start' }); else d.scrollTop = deskTop; return () => { if (!fk) deskTop = d.scrollTop; }; }, [fk]);
  const open = (x: Q.Segment) => { if (x.kind === 'missing') go(`/kontrola/chybi-${x.refId}`); else if (x.kind === 'report') go(x.state === 'submitted' ? `/kontrola/${x.key}` : `/zprava/${x.key}`); else if (x.kind === 'item') go(x.refId ? `/porada/pokyny/${x.refId}` : '/porada/pokyny'); };
  const label = (x: Q.Segment) => x.state === 'submitted' ? <span className="mn w">Čeká na kontrolu</span> : x.kind === 'missing' ? <span className="mn w">{x.state === 'checked' ? 'Chybí zpráva, odstavec zkontrolovaný' : 'Chybí zpráva'}</span> : null;
  return <Desk cls="mg clip" fold={`Otevřít celý dokument, ${Q.pagesText(Q.pagesOf(b))}`} right={<DocNav built={b} attention={ATT} />} note={note ? <b>{note}</b> : <><b>Celý dokument, {Q.pagesText(Q.pagesOf(b))}.</b> Klikněte na část a upravte ji.</>}><div className="wrapm"><Sheet built={b} marginNote={label} onSeg={open} cls={(x) => `${x.state === 'submitted' ? 'np' : ''}${x.key === fk ? ' cur' : ''}`} /></div></Desk>;
}
const Jr = ({ n, t, why, to, a, st }: { n: number; t: string; why: string; to: string; a?: string; st: 'c' | 'd' | '' }) => <li className={st}><a href={`#${to}`}><i>{st === 'd' ? <Ic n="chk" /> : n}</i><span className="tx"><b>{t}</b><span>{why}</span></span>{a ? <span className="btn">{a}</span> : null}</a></li>;
export function Porada() {
  const { s } = useStore(); const u = Q.me(s)!; const m = useM(); const iss = Q.issueOf(s, m); const sl = Q.working(s);
  const [dlg, setDlg] = useState<'move' | 'drop' | 'add' | null>(null);
  if (!iss) return <PoradaVirtual m={m} />;
  const whole = Q.buildDoc(s, m, { pending: true });
  const q = Q.queuePoints(s).length + Q.queueFutures(s).length + Q.placeholderQueue(s, u).length;
  const newRows = iss.rows.filter((r) => r.isNew).length;
  const miss = Q.owedTo(s, m).filter((o) => !o.delivered && !o.notYetOver);
  const talent = s.registry.find((l) => l.purpose === 'annex1');
  const annexCount = Q.firstExtraAnnex(iss) - 1 + iss.annexes.length;
  const steps = [
    { t: q ? `Zkontrolovat ${counts(q, 'položku', 'položky', 'položek')}` : 'Všechno je zkontrolované', why: 'Co neschválíte, nevyjde.', to: '/kontrola', a: q ? 'Začít' : '', done: !q },
    { t: newRows ? `Zařadit ${counts(newRows, 'schválený návrh', 'schválené návrhy', 'schválených návrhů')}` : 'Pokyny a hospodaření', why: newRows ? iss.rows.filter((r) => r.isNew).map((r) => r.title).join(', ') : 'Převzato z minulé porady.', to: '/porada/pokyny', a: newRows ? 'Zařadit' : '', done: !newRows },
    { t: miss.length ? `Doplnit ${counts(miss.length, 'chybějící zprávu', 'chybějící zprávy', 'chybějících zpráv')}` : 'Zprávy z akcí jsou všechny', why: miss.length ? 'Jinak se vytiskne jen krátký odstavec o akci.' : 'Nic nechybí.', to: '/porada/zpravy', a: miss.length ? 'Doplnit' : '', done: !miss.length },
    { t: 'Přítomní a hosté', why: iss.present ? 'Převzato z minulé porady.' : 'Přítomní nejsou vyplnění.', to: '/porada/udaje', a: iss.present ? '' : 'Vyplnit', done: !!iss.present },
    { t: annexCount > 1 ? `Přílohy: ${annexCount}` : 'Přílohy', why: annexCount > 1 ? ['Příloha 1 ze seznamu studentů', ...(Q.hasAnnex2(iss) ? ['Příloha 2 z minulých porad'] : []), ...iss.annexes.map((a) => a.title || 'Bez názvu')].join(', ') : 'Jen Příloha 1 ze seznamu studentů.', to: '/porada/prilohy', a: '', done: true },
    { t: 'Seznamy studentů', why: talent?.entries.some((e) => e.isNew) ? `Noví studenti v Příloze 1: ${talent.entries.filter((e) => e.isNew).length}.` : 'Beze změny od minulé porady.', to: '/seznamy', a: '', done: true },
    { t: 'Vygenerovat dokument', why: 'Nakonec zkontrolujete celý náhled.', to: '/porada/nahled', a: 'Otevřít náhled', done: false },
  ];
  const first = steps.findIndex((x) => !x.done);
  const reqs = Q.pendingRequests(s);
  return <App desk={<WholeDesk />} over={dlg === 'move' ? <MoveDialog m={m} onClose={() => setDlg(null)} /> : dlg === 'drop' ? <DropDialog m={m} onClose={() => setDlg(null)} /> : dlg === 'add' ? <AddDialog onClose={() => setDlg(null)} /> : null} col={<>
    <Top big h={`Porada ${Q.dm(iss.meetingDate)}`} lead={<>Termín pro učitele je <b>{WHEN(iss.deadlineAt)}</b>{new Date(iss.deadlineAt) < new Date(s.now) ? ', už minul' : ''}. V dokumentu {whole.points >= 2 && whole.points <= 4 ? 'jsou' : 'je'} {counts(whole.points, 'bod', 'body', 'bodů')}, {Q.pagesText(Q.pagesOf(whole))}{whole.points > Q.buildDoc(s, m).points ? `. Z toho ${notYet(whole.points - Q.buildDoc(s, m).points)}` : ''}.</>} />
    <ol className="jr">{steps.map((x, i) => <Jr key={x.t} n={steps.slice(0, i + 1).filter((y) => !y.done).length} t={x.t} why={x.why} to={x.to} {...(x.a ? { a: x.a } : {})} st={x.done ? 'd' : i === first ? 'c' : ''} />)}</ol>
    <button type="button" className="add" onClick={() => go('/pridat')}><span>Přidat do porady</span><b><Ic n="plus" /></b></button>
    {reqs.length ? <Sec h="Žádosti o přístup"><Item to="/lide" t={reqs.map((r) => r.name).join(' a ')} st="Čekají na Vaše rozhodnutí" mk="o" /></Sec> : null}
    <Sec h="Další porady">{Q.slotsOf(s).filter((x) => Q.toIsoDate(x.monday) > m).slice(0, 3).map((x) => <Item key={Q.toIsoDate(x.monday)} t={Q.dm(x.meetingDate)} st={`Uzávěrka ${WHEN(x.deadlineAt)}`} />)}</Sec>
    {u.role === 'headmaster' ? <button type="button" className="q" onClick={() => setDlg('add')}>Přidat poradu</button> : null}
    {sl.status === 'open' ? <><button type="button" className="q" onClick={() => setDlg('move')}>Přesunout poradu</button><button type="button" className="q" onClick={() => setDlg('drop')}>Porada se nekoná</button></> : null}
  </>} />;
}
function PoradaVirtual({ m }: { m: string }) { return <App col={<Top big h={`Porada ${Q.dm(m)}`} lead="Tato porada se začne připravovat, až do ní někdo něco pošle." />} />; }
const REFUSE: Record<string, string> = { early: 'Ten den už patří dřívější poradě.', late: 'Tak daleko dopředu kalendář nesahá.', same: 'Na ten den porada už je.', 'porada-exists': 'V tom týdnu už porada je. Přesuňte ji, nebo zvolte jiný týden.', 'not-open': 'Tato porada už není otevřená.', 'later-generated': 'Pozdější porada už je vygenerovaná.', 'deadline-past': 'Uzávěrka by tím už minula, a teď je ještě otevřená.', 'meeting-order': 'Pořadí porad by tím přestalo sedět.' };
const Confirm = ({ ok, label, onClick }: { ok: boolean; label: string; onClick: () => void }) => <button type="button" className={`btn lg w ${ok ? 'dk' : 'off'}`} aria-disabled={!ok} onClick={() => { if (ok) onClick(); }}>{label}</button>;
function MoveDialog({ m, onClose }: { m: string; onClose: () => void }) {
  const { s, apply } = useStore(); const [d, set] = useState('');
  const slot = Q.slotsOf(s).find((x) => toIsoDate(x.monday) === m); const bounds = slot ? moveBounds(Q.slotsOf(s), slot, Q.todayOf(s)) : null;
  const plan = useMemo(() => { try { return d ? A.planMoveOf(s, m, parseIsoDate(d)) : null; } catch { return null; } }, [s, m, d]);
  const effect = !plan ? 'Vyberte den.' : !plan.ok ? REFUSE[plan.refusal] : `Porada bude ${Q.dm(d)}, uzávěrka ${WHEN(plan.moved.deadlineAt)}.`;
  return <Dialog title="Přesunout poradu" onClose={onClose}><p>Vyberte nový den porady. Body, pokyny i přílohy zůstanou u ní.</p><label className="l">Den<input className="in bigi" type="date" value={d} {...(bounds && { min: toIsoDate(bounds.from), max: toIsoDate(bounds.to) })} onChange={(e) => set(e.target.value)} /></label><div className={`fx${plan && !plan.ok ? ' bad' : ''}`} role="status">{effect}</div><Confirm ok={!!plan?.ok} label="Přesunout" onClick={() => { apply(A.movePorada(m, parseIsoDate(d))); onClose(); }} /></Dialog>;
}
function DropDialog({ m, onClose }: { m: string; onClose: () => void }) {
  const { s, apply } = useStore(); const [tick, setTick] = useState(false); const iss = Q.issueOf(s, m);
  const plan = A.planDropOf(s, m);
  const prepared = !!iss && (iss.rows.some((r) => !!r.pointId || r.isNew) || iss.annexes.length > 0 || !!iss.present || !!iss.guests);
  const effect = !plan ? 'Tuto poradu nejde zrušit.' : !plan.ok ? REFUSE[plan.refusal] : <>Porada {Q.dm(iss?.meetingDate ?? m)} se nebude konat a zmizí z kalendáře. Odevzdané body přejdou na poradu {Q.dm(plan.heir.meetingDate)} {plan.heir.status !== 'open' ? 'Ta porada je už vygenerovaná, proto se připravený program smaže.' : prepared ? 'Připravený program (pokyny, přílohy, přítomní) půjde s nimi.' : 'Nic připraveného tu zatím není.'}</>;
  return <Dialog title="Porada se nekoná" onClose={onClose}><div className={`fx${plan && !plan.ok ? ' bad' : ''}`} role="status">{effect}</div><label className="chk"><input type="checkbox" checked={tick} onChange={(e) => setTick(e.target.checked)} />Rozumím, poradu pak nelze vrátit.</label><Confirm ok={!!plan?.ok && tick} label="Porada se nekoná" onClick={() => { apply(A.dropPorada(m)); onClose(); }} /></Dialog>;
}
function AddDialog({ onClose }: { onClose: () => void }) {
  const { s, apply } = useStore(); const [d, set] = useState('');
  const plan = useMemo(() => { try { return d ? A.planAddOf(s, parseIsoDate(d)) : null; } catch { return null; } }, [s, d]);
  const effect = !plan ? 'Vyberte den.' : !plan.ok ? REFUSE[plan.refusal] : `Nová porada ${Q.dm(d)}, uzávěrka ${WHEN(plan.added.deadlineAt)}.${plan.closed ? ' Uzávěrka už minula, učitelé do ní nic nepošlou.' : ''}`;
  return <Dialog title="Přidat poradu" onClose={onClose}><p>Vyberte den další porady. Týden, ve kterém už porada je, přidat nejde.</p><label className="l">Den<input className="in bigi" type="date" value={d} min={toIsoDate(Q.todayOf(s))} onChange={(e) => set(e.target.value)} /></label><div className={`fx${plan && !plan.ok ? ' bad' : ''}`} role="status">{effect}</div><Confirm ok={!!plan?.ok} label="Přidat poradu" onClick={() => { apply(A.addPorada(parseIsoDate(d))); onClose(); }} /></Dialog>;
}
export function Udaje() {
  const { s, apply } = useStore(); const m = useM(); const iss = Q.issueOf(s, m)!; const [ok, setOk] = useState(false);
  const [pr, setPr] = useState(iss.present), [gu, setGu] = useState(iss.guests);
  const dirty = pr !== iss.present || gu !== iss.guests;
  return <App nar desk={<WholeDesk note="Takhle to teď vypadá. Přeškrtnuté zatím nevyjde." />} over={ok ? <Toast onDone={() => setOk(false)}>Uloženo</Toast> : null} dock={<div className="dock"><div className="row"><button type="button" className={`btn lg ${dirty ? 'go' : 'off'}`} aria-disabled={!dirty} onClick={() => { if (!dirty) return; apply(A.saveIssueTexts(m, pr, gu)); setOk(true); }}>Uložit</button></div></div>} col={<>
    <Back to="/porada" t="Zpět na poradu" /><Top h="Přítomní a hosté" lead="Převzato z minulé porady. Co tu změníte, přejde i do další." />
    <div className="stack"><label className="l">Přítomni<textarea className="in" value={pr} onChange={(e) => setPr(e.target.value)} /></label><label className="l">Hosté<input className="in" value={gu} onChange={(e) => setGu(e.target.value)} /></label></div>
  </>} />;
}
/** The address of the older Příloha 2: one text with no title, which later poradas carry until it is removed. */
const ANNEX2 = 'priloha-2';
/** Příloha 1 comes from the student list; everything else is written here and starts on its own page. */
export function Prilohy({ id }: { id?: string }) {
  const { s, apply } = useStore(); const m = useM(); const iss = Q.issueOf(s, m)!; const [rm, setRm] = useState(false);
  const annex = iss.annexes.find((a) => a.id === id); const k = annex ? iss.annexes.indexOf(annex) : -1; const first = Q.firstExtraAnnex(iss);
  const talent = s.registry.find((l) => l.purpose === 'annex1');
  // Both editors save as you type; the button only takes you back to the list.
  const done = <div className="dock"><div className="row"><button type="button" className="btn lg go" onClick={() => go('/porada/prilohy')}>Hotovo</button></div></div>;
  if (id === ANNEX2) {
    return <App nar dock={done} over={rm ? <Dialog title="Odebrat přílohu 2?" onClose={() => setRm(false)}><p>Zmizí z této porady i z dalších. Další přílohy se přečíslují.</p><div className="row"><button className="btn lg" onClick={() => setRm(false)}>Nechat</button><button className="btn dk lg" onClick={() => { apply(A.setAnnex2(m, null)); go('/porada/prilohy'); }}>Odebrat</button></div></Dialog> : null}
      desk={<WholeDesk note="Takhle to teď vypadá. Přeškrtnuté zatím nevyjde." focus={(x) => x.blocks.some((b) => b.kind === 'annex' && b.text === 'PŘÍLOHA 2')} />} col={<><Back to="/porada/prilohy" t="Zpět na přílohy" /><Top h="Příloha 2" lead="Začne na nové stránce. Ukládá se to samo a přechází i do dalších porad." />
        <TextPart doc={iss.annex2 ?? emptyRichDoc()} onChange={(doc) => apply(A.setAnnex2(m, doc))} /><button type="button" className="q r" onClick={() => setRm(true)}>Odebrat přílohu</button></>} />;
  }
  if (id && !annex) return <NotFound />;
  if (annex) {
    const name = `Příloha ${k + first}`;
    return <App nar dock={done} over={rm ? <Dialog title={`Odebrat přílohu ${k + first}?`} onClose={() => setRm(false)}><p>Zmizí z této porady i s textem, tabulkami a obrázky. Další přílohy se přečíslují.</p><div className="row"><button className="btn lg" onClick={() => setRm(false)}>Nechat</button><button className="btn dk lg" onClick={() => { apply(A.removeAnnex(m, annex.id)); go('/porada/prilohy'); }}>Odebrat</button></div></Dialog> : null}
      desk={<WholeDesk note="Takhle to teď vypadá. Přeškrtnuté zatím nevyjde." focus={(x) => x.blocks.some((b) => b.kind === 'annex' && b.text === `PŘÍLOHA ${k + first}`)} />} col={<><Back to="/porada/prilohy" t="Zpět na přílohy" /><Top h={annex.title || name} lead="Začne na nové stránce. Ukládá se to samo." />
        <AnnexEditor n={k + first} annex={annex} onChange={(a) => apply(A.saveAnnex(m, a))} /><button type="button" className="q r" onClick={() => setRm(true)}>Odebrat přílohu</button></>} />;
  }
  return <App nar desk={<WholeDesk note="Takhle to teď vypadá. Přeškrtnuté zatím nevyjde." />} col={<><Back to="/porada" t="Zpět na poradu" /><Top h="Přílohy" lead="Tisknou se za podpisem, v tomto pořadí. Každá začíná na nové stránce." />
    <Sec h="Příloha 1"><Item to={`/seznamy/${talent?.key ?? ''}`} t={talent?.name ?? 'Seznam studentů'} st={`Ze seznamu, ${counts(talent?.entries.length ?? 0, 'student', 'studenti', 'studentů')}`} /></Sec>
    {Q.hasAnnex2(iss) || iss.annexes.length ? <Sec h="Další přílohy">{Q.hasAnnex2(iss) ? <div className="rowi"><div className="updn" /><a className="tx" href={`#/porada/prilohy/${ANNEX2}`}><span className="tt">Příloha 2</span><span className="st">text, přechází i do dalších porad</span></a></div> : null}{iss.annexes.map((a, i) => <div className="rowi" key={a.id}><div className="updn"><button type="button" aria-label={`Posunout výš: ${a.title}`} onClick={() => apply(A.moveAnnex(m, a.id, -1))}><Ic n="up" /></button><button type="button" aria-label={`Posunout níž: ${a.title}`} onClick={() => apply(A.moveAnnex(m, a.id, 1))}><Ic n="down" /></button></div><a className="tx" href={`#/porada/prilohy/${a.id}`}><span className="tt">Příloha {i + first}: {a.title || 'bez názvu'}</span><span className="st">{a.parts.map((p) => ({ text: 'text', table: 'tabulka', image: 'obrázek' }[p.kind])).join(', ') || 'Zatím prázdná'}</span></a></div>)}</Sec> : null}
    <button type="button" className="btn lg w" onClick={() => { let n = ''; apply(A.addAnnex(m, (x) => (n = x))); setTimeout(() => go(`/porada/prilohy/${n}`)); }}><Ic n="plus" />Přidat přílohu</button></>} />;
}
/** A row that creates something ends in a plus; a row that opens a page keeps the chevron. */
const PLUS = <span className="gl"><Ic n="plus" /></span>;
const DOC_NOTE = 'Takhle to teď vypadá. Přeškrtnuté zatím nevyjde.';
/** New things first, then the points already in the porada that take more text: the headmaster's way to put anything in, with no approval step. */
export function Pridat() {
  const { s, apply } = useStore(); const m = useM(); const iss = Q.issueOf(s, m); const rows = iss?.rows ?? [];
  const future = (k: 'akce' | 'jednani') => { const id = createWith(apply, s, (cb) => A.createFuture(k, cb)); go(`/nova-akce/${id}`); };
  const report = () => { const id = createWith(apply, s, (cb) => A.createPoint('report', 'jine', null, cb)); go(`/psat/${id}/zaklad`); };
  const { points, partners, meetings } = Q.addable(rows, iss ? Q.outlineOf(Q.buildDoc(s, m, { pending: true })) : []);
  const meetRow = rows.find((r) => r.slot === 'meetings');
  // A point the document does not print yet has no number to name, so it is named by its title.
  const until = (n: number | undefined, t: string) => (n === undefined ? `Do bodu „${t}“` : `Do bodu ${n}, ${t}`);
  const pointLine = (r: Row, n: number | undefined) => {
    const empty = isRichDocEmpty(r.body); const state = n === undefined ? (empty ? ', bez textu se netiskne' : ', zatím se netiskne') : empty ? ', zatím bez textu' : '';
    return `${r.persistence === 'standing' ? 'Trvalý bod' : 'Jen pro tuto poradu'}${state}`;
  };
  return <App {...(iss ? { desk: <WholeDesk note={DOC_NOTE} /> } : {})} col={<>
    <Back to="/porada" t="Zpět na poradu" /><Top h="Přidat do porady" lead="Co přidáte, jde rovnou do porady, bez schvalování." />
    <Sec h="Nové">
      <Item act={() => future('akce')} t="Akce" st="Podle data se zařadí sama" end={PLUS} />
      <Item act={() => future('jednani')} t="Jednání" st={meetRow ? until(meetings, meetRow.title) : 'Zařadí se mezi jednání'} end={PLUS} />
      {iss ? <Item to="/porada/pokyny-novy?z=pridat" t="Bod" st="Vlastní nadpis a text, do Pokynů nebo Hospodaření" end={PLUS} /> : null}
      <Item act={report} t="Zpráva o tom, co proběhlo" st="Do Provozu školy, s účastníky a vyjádřením" end={PLUS} />
      {partners ? <Item to={`/porada/pokyny/${partners.row.id}?z=pridat`} t="Ohlas sociálního partnera" st={`${until(partners.n, partners.row.title)}, teď ${partners.row.quotes.length}`} end={PLUS} /> : null}
      <Item to="/seznamy" t="Student do seznamu" st="Talentovaní studenti nebo uvolnění z výuky" />
      {iss ? <Item to="/porada/prilohy" t="Příloha" st="Text, tabulka nebo obrázek" /> : null}
    </Sec>
    {points.length ? <Sec h="Doplnit do bodu, který v poradě už je">{points.map(({ row: r, n }) => <Item key={r.id} to={`/porada/pokyny/${r.id}?z=pridat`} t={n === undefined ? r.title : `${n}. ${r.title}`} st={pointLine(r, n)} />)}</Sec> : null}
  </>} />;
}
export function Pokyny({ rowId, adding, section, from }: { rowId?: string; adding?: boolean; section?: 'pokyny' | 'hospodareni'; from?: 'pridat' }) {
  const { s, apply } = useStore(); const m = useM(); const iss = Q.issueOf(s, m)!;
  const row = iss.rows.find((r) => r.id === rowId);
  const [title, setT] = useState(row?.title ?? ''); const [body, setB] = useState(row ? annexToText(row.body) : ''); const [per, setP] = useState<'standing' | 'once'>(row?.persistence ?? 'once'); const [sec, setSec] = useState<'pokyny' | 'hospodareni'>(row?.section ?? section ?? 'pokyny');
  const partners = row?.slot === 'partners'; const [quotes, setQ] = useState<Statement[]>(row?.quotes ?? []); const putQ = (i: number, p: Partial<Statement>) => setQ(quotes.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const qOk = quotes.every((q) => q.speakerGenitive.trim() && q.quote.trim()); const canSave = !!title.trim() && qOk;
  const cleanQ = (): Statement[] => quotes.map((q) => ({ speakerGenitive: q.speakerGenitive.trim(), quote: q.quote.trim(), ...(q.affiliation?.trim() ? { affiliation: q.affiliation.trim() } : {}) }));
  const SECT = (k: 'pokyny' | 'hospodareni', h: string) => <Sec h={h}>{iss.rows.filter((r) => r.section === k && !Q.isAutoRow(r)).map((r, i, rows) => <div className={`rowi${r.isNew ? ' nw-r' : ''}`} key={r.id}>
    <div className="updn"><button type="button" aria-label={`Posunout výš: ${r.title}`} disabled={i === 0} onClick={() => apply(A.moveRow(m, r.id, -1))}><Ic n="up" /></button><button type="button" aria-label={`Posunout níž: ${r.title}`} disabled={i === rows.length - 1} onClick={() => apply(A.moveRow(m, r.id, 1))}><Ic n="down" /></button></div>
    <a className="tx" href={`#/porada/pokyny/${r.id}`}><span className="tt">{r.title}</span><span className="st">{r.isNew ? 'Nově schválený návrh' : r.persistence === 'standing' ? 'Trvalý bod' : 'Jen pro tuto poradu'}</span></a>
    {r.isNew && rows.length > 1 ? <div className="plc"><label className="l sm">Zařadit za bod<select className="in" value="" onChange={(e) => e.target.value && apply(A.placeRowAfter(m, r.id, e.target.value))}><option value="">Vyberte bod</option>{rows.filter((x) => x.id !== r.id).map((x) => <option key={x.id} value={x.id}>{x.title.length > 60 ? `${x.title.slice(0, 60)}…` : x.title}</option>)}</select></label><button type="button" className="q" onClick={() => apply(A.placeRow(m, r.id))}>Nechat na konci</button></div> : null}
  </div>)}</Sec>;
  if (row || adding) {
    const proposal = row?.pointId ?? null;
    const gen = row && (proposal || row.slot === 'meetings' || row.slot === 'events' || row.slot === 'talent' || row.slot === 'exemptions');
    const back = from === 'pridat' ? { to: '/pridat', t: 'Zpět na přidávání' } : { to: '/porada/pokyny', t: 'Zpět na pokyny' };
    const done = () => go(back.to);
    return <App nar desk={<WholeDesk note="Takhle to teď vypadá. Přeškrtnuté zatím nevyjde." {...(row ? { focus: (x: Q.Segment) => x.refId === row.id } : {})} />} dock={gen ? undefined : <div className="dock">{!qOk ? <p className="hint a">U každého ohlasu vyplňte, kdo ho napsal, a jeho text.</p> : null}<div className="row"><button type="button" className={`btn lg ${canSave ? 'go' : 'off'}`} aria-disabled={!canSave} onClick={() => { if (!canSave) return; if (row && partners) apply(A.saveRow(m, row.id, { title, quotes: cleanQ(), persistence: per })); else if (row) apply(A.saveRow(m, row.id, { title, body: annexDoc(body), persistence: per })); else apply(A.addRow(m, sec, title, annexDoc(body), per)); done(); }}>Uložit</button></div></div>} col={<>
      <Back to={back.to} t={back.t} /><Top h={adding ? 'Nový bod' : row!.title} {...(gen ? { lead: proposal ? 'Text schváleného návrhu se upravuje v kontrole, tady ho lze jen přesunout.' : row!.slot === 'talent' || row!.slot === 'exemptions' ? 'Tento bod se plní ze seznamů studentů.' : 'Tento bod se plní sám ze schválených akcí.' } : {})} />
      {proposal ? <a className="btn lg w" href={`#/navrh/${proposal}`}>Otevřít návrh</a> : gen ? <a className="btn lg w" href={row!.slot === 'talent' || row!.slot === 'exemptions' ? '#/seznamy' : '#/akce'}>{row!.slot === 'talent' || row!.slot === 'exemptions' ? 'Otevřít seznamy' : 'Otevřít akce'}</a> : <div className="stack">
        {adding ? <Seg label="Sekce" value={sec} options={[['pokyny', 'Pokyny'], ['hospodareni', 'Hospodaření']]} onChange={setSec} /> : null}
        <label className="l">Název<input className="in" autoFocus={!!adding} value={title} onChange={(e) => setT(e.target.value)} /></label>
        {partners ? <div className="stack">{quotes.map((q, i) => <section className="stack st8 mz" key={i}><h2>Ohlas {i + 1}</h2><label className="l">Kdo ho napsal<small>Ve 2. pádě, například pana Jana Nováka</small><input className="in" maxLength={POINT_LIMITS.speakerGenitive} value={q.speakerGenitive} onChange={(e) => putQ(i, { speakerGenitive: e.target.value })} /></label><label className="l">Funkce a organizace<small>Nepovinné, například ředitele partnerské školy</small><input className="in" maxLength={POINT_LIMITS.statementAffiliation} value={q.affiliation ?? ''} onChange={(e) => putQ(i, { affiliation: e.target.value })} /></label><label className="l">Text ohlasu<textarea className="in" maxLength={POINT_LIMITS.quote} value={q.quote} onChange={(e) => putQ(i, { quote: e.target.value })} /></label><button type="button" className="q r" aria-label={`Odebrat ohlas ${i + 1}`} onClick={() => setQ(quotes.filter((_, j) => j !== i))}>Odebrat ohlas</button></section>)}{quotes.length < OUTLINE_LIMITS.quotes ? <button type="button" className="btn lg w" onClick={() => setQ([...quotes, { speakerGenitive: '', quote: '' }])}><Ic n="plus" />Přidat ohlas</button> : <p className="sm">Víc ohlasů se do jedné porady nevejde.</p>}</div> : <OutlineField label="Text" value={body} onChange={setB} />}
        {!row?.slot ? <div className="stack st6"><span className="lb">Jak dlouho platí</span><Seg label="Jak dlouho platí" value={per} options={[['standing', 'Trvale, přejde do další porady'], ['once', 'Jen pro tuto poradu']]} onChange={setP} /></div> : null}
        {row && !row.slot && !proposal ? <button className="q r" onClick={() => { apply(A.removeRow(m, row.id)); done(); }}>Odebrat bod</button> : null}
      </div>}
    </>} />;
  }
  return <App desk={<WholeDesk note="Takhle to teď vypadá. Přeškrtnuté zatím nevyjde." />} col={<><Back to="/porada" t="Zpět na poradu" /><Top h="Pokyny a hospodaření" lead="Pořadí je pořadí v dokumentu. Klikněte na bod a upravte ho." />{SECT('pokyny', 'Pokyny')}{SECT('hospodareni', 'Hospodaření')}<a className="btn lg w" href="#/porada/pokyny-novy"><Ic n="plus" />Přidat bod</a></>} />;
}
/** What each placeholder waits for (ADR 0061); the detail is in Ke kontrole. */
const phLine = (h: Q.PlaceholderItem) => h.status === 'checked' ? 'Zkontrolováno' : h.status === 'to-check' ? 'Čeká na Vaši kontrolu' : h.status === 'handed-in' ? 'Zpráva je odevzdaná a čeká na rozhodnutí' : `Autor může zprávu odevzdat do ${Q.clock(h.close).full}`;
export function Zpravy() {
  const { s } = useStore(); const m = useM(); const list = Q.placeholdersOf(s, m);
  const todo = list.filter((h) => h.status !== 'checked').length;
  return <App nar desk={<WholeDesk note="Takhle to teď vypadá. Přeškrtnuté zatím nevyjde." />} col={<>
    <Back to="/porada" t="Zpět na poradu" />
    <Top h="Chybějící zprávy" lead={list.length ? `Kde zpráva nebude, vytiskneme odstavec, který napsal systém. ${todo ? `Zkontrolovat zbývá ${counts(todo, 'odstavec', 'odstavce', 'odstavců')}.` : 'Všechny odstavce jsou zkontrolované.'}` : 'Nic nechybí, všechny zprávy jsou schválené.'} />
    {list.length ? <Sec h="Za nedodané zprávy">{list.map((h) => <Item key={h.akce.id} to={`/kontrola/chybi-${h.akce.id}`} t={h.akce.title} st={phLine(h)} mk={h.status === 'checked' ? 'c' : h.status === 'to-check' ? 'n' : 'o'} />)}</Sec> : null}
  </>} />;
}
export function Nahled() {
  const { s, apply } = useStore(); const m = useM(); const iss = Q.issueOf(s, m)!; const checks = Q.preflight(s, m); const [dlg, setDlg] = useState(false); const [tick, setTick] = useState(false); const [dropFor, setDropFor] = useState<string | null>(null); const [ask, setAsk] = useState(false);
  const unchecked = checks.find((c) => c.code === 'placeholders-unchecked')?.n ?? 0;
  const blocked = checks.some((c) => c.level === 'block'); const b = Q.buildDoc(s, m, { pending: true }); const printed = Q.buildDoc(s, m); const narrow = useNarrow(); const [openDoc, setOpenDoc] = useState(false);
  const link = (to?: string) => (to === 'kontrola' ? '#/kontrola' : to === 'zpravy' ? '#/porada/zpravy' : to === 'pokyny' ? '#/porada/pokyny' : to === 'udaje' ? '#/porada/udaje' : to === 'seznamy' ? '#/seznamy' : undefined);
  const rows = checks.map((c) => ({ k: (c.level === 'ok' ? 'd' : c.level === 'block' ? 'x' : 'n') as 'd' | 'x' | 'n', t: link(c.to) ? <a href={link(c.to)}>{c.text}</a> : c.to && /^\d{4}-\d{2}-\d{2}$/.test(c.to) ? <a href="#" role="button" onClick={(e) => { e.preventDefault(); setDlg(false); setDropFor(c.to!); }}>{c.text}</a> : c.text }));
  return <App nar over={dropFor ? <DropDialog m={dropFor} onClose={() => setDropFor(null)} /> : ask ? <Dialog title="Nezkontrolované odstavce" onClose={() => setAsk(false)}><p>{unchecked === 1 ? '1 odstavec za nedodanou zprávu jste nezkontrolovali. Vyjde tak, jak ho napsal systém.' : `${unchecked} ${unchecked >= 2 && unchecked <= 4 ? 'odstavce' : 'odstavců'} za nedodané zprávy jste nezkontrolovali. Vyjdou tak, jak je napsal systém.`}</p><button type="button" className="btn go lg w" onClick={() => { setAsk(false); go('/porada/zpravy'); }}>Zkontrolovat</button><button type="button" className="btn lg w" onClick={() => { setAsk(false); setTick(false); setDlg(true); }}>Vygenerovat i tak</button></Dialog> : dlg ? <Dialog title="Vygenerovat dokument?" onClose={() => setDlg(false)}><Todo rows={rows.filter((r) => r.k !== 'd')} /><div className="fx">{counts(printed.points, 'bod', 'body', 'bodů')} {printed.points >= 2 && printed.points <= 4 ? 'vyjdou' : 'vyjde'}, zveřejní se a dokument si stáhne vedení.</div><label className="chk"><input type="checkbox" checked={tick} onChange={(e) => setTick(e.target.checked)} />Rozumím, poradu pak nelze změnit.</label><button type="button" className={`btn lg w ${tick ? 'go' : 'off'}`} aria-disabled={!tick} onClick={() => { if (!tick) return; apply(A.generate(m)); goReplace(`/hotovo/${m}`); }}>Vygenerovat a zveřejnit</button></Dialog> : null}
    dock={<div className="dock">{blocked ? <p className="hint a">Nejdřív vyřešte, co je výše červeně.</p> : null}<div className="row"><button type="button" className={`btn lg ${blocked ? 'off' : 'go'}`} aria-disabled={blocked} onClick={() => { if (blocked) return; if (unchecked) setAsk(true); else { setTick(false); setDlg(true); } }}>Vygenerovat a zveřejnit</button></div></div>}
    desk={narrow ? undefined : <Desk cls="mg clip" right={<DocNav built={b} attention={ATT} />} note={<b>Takhle vyjde, když vygenerujete teď</b>}><div className="wrapm"><Sheet built={b} cls={(x) => (x.state === 'submitted' ? 'np' : '')} marginNote={(x) => (x.state === 'submitted' ? <span className="mn w">Neschváleno, teď by nevyšlo</span> : x.kind === 'missing' ? <span className="mn w">{x.state === 'checked' ? 'Chybí zpráva, vytiskne se zkontrolovaný odstavec' : 'Chybí zpráva, vytiskne se odstavec'}</span> : null)} /></div></Desk>}
    col={<><Back to="/porada" t="Zpět na poradu" /><Top h="Náhled porady" lead={`${printed.points >= 2 && printed.points <= 4 ? 'Jdou' : 'Jde'} do něj ${counts(printed.points, 'bod', 'body', 'bodů')}, ${Q.pagesText(Q.pagesOf(b))}. Přeškrtnuté zatím nevyjde.`} />{unchecked ? <Note err h="Některé odstavce za nedodané zprávy nejsou zkontrolované.">Vyjdou tak, jak je napsal systém. <a href="#/porada/zpravy">Zkontrolovat odstavce</a></Note> : null}<Sec h="Před generováním"><Todo rows={rows} /></Sec>{narrow ? (openDoc ? <><DocNav built={b} attention={ATT} /><div className="pv"><p className="pvh">Dokument</p><Sheet built={b} cls={(x) => (x.state === 'submitted' ? 'np' : '')} /></div></> : <button type="button" className="btn lg w" onClick={() => setOpenDoc(true)}>Otevřít celý dokument</button>) : null}<p className="sm" hidden>{iss.monday}</p></>} />;
}
const modelOf = (s: ReturnType<typeof useStore>['s'], m: string) => (Q.issueOf(s, m)?.doc?.model as DocumentModel | null) ?? Q.buildDoc(s, m).model;
/** The real files of a generated porada: the server's DOCX and the worker's PDF, same-site GETs. */
function DocxBtn({ cls, m, children }: { cls?: string; m: string; children: string }) {
  return <a className={cls} href={`/porada/${m}/dokument/docx`}>{children}</a>;
}
const PdfBtn = ({ cls, m }: { cls?: string; m: string }) => <a className={cls} href={`/porada/${m}/dokument/pdf`}>Stáhnout PDF</a>;
export function Hotovo({ m }: { m: string }) {
  const { s } = useStore(); const iss = Q.issueOf(s, m); if (!iss?.doc) return <NotFound />;
  const model = modelOf(s, m)!;
  const pdf = iss.doc.pdf;
  return <App nar desk={<Desk cls="tall" fold={`Otevřít dokument, ${Q.pagesText(Q.pagesOf(Q.builtOfModel(model)))}`} right={<DocNav built={Q.builtOfModel(model)} />} note={<b>Takhle vyšla</b>}><div className="wrapm wrapn"><div className="arch-wrap rise"><Stamp t="Hotovo" /><Sheet built={Q.builtOfModel(model)} /></div></div></Desk>} col={<>
    <Top h={`Hotovo. Porada ${Q.dm(iss.meetingDate)} je na světě.`} lead={`${iss.doc.points === 1 ? 'Vyšel' : iss.doc.points >= 2 && iss.doc.points <= 4 ? 'Vyšly' : 'Vyšlo'} ${counts(iss.doc.points, 'bod', 'body', 'bodů')}. Autoři své zprávy uvidí jako zveřejněné.`} />
    <div className="stack st8"><DocxBtn cls="btn go lg w" m={m}>Stáhnout DOCX</DocxBtn>
      {pdf === 'rendering' ? <div className="btn off lg w" role="status">PDF se připravuje…</div> : pdf === 'failed' ? <><Note err h="PDF se nepovedlo">DOCX je v pořádku. PDF zkuste vytvořit znovu.</Note></> : <PdfBtn cls="btn lg w" m={m} />}
    </div>
    {iss.doc.left?.moved.length ? <Note h={`Nevyšlo, čeká na další poradu: ${iss.doc.left.moved.length}`}>{iss.doc.left.moved.join(', ')}. Vedení to dál může zkontrolovat.</Note> : null}{iss.doc.left?.missed.length ? <Note h={`Vyšlo jen jako krátký odstavec: ${iss.doc.left.missed.length}`}>{iss.doc.left.missed.join(', ')}. Zpráva z těchto akcí nedorazila včas.</Note> : null}
    <a className="q" href="#/archiv">Otevřít archiv</a><a className="q" href="#/porada">Na další poradu</a>
  </>} />;
}
/** A download that gave no file lands here with `?chyba=`: say why once, then take it off the address. */
function DownloadNotice({ q }: { q: URLSearchParams }) {
  const [text, setText] = useState(() => { const c = q.get('chyba'); return isDownloadError(c) ? downloadFailed[c] : null; });
  useEffect(() => {
    const [path = '', qs = ''] = location.hash.split('?'); const rest = new URLSearchParams(qs);
    if (!rest.has('chyba')) return;
    rest.delete('chyba');
    const tail = rest.toString();
    history.replaceState(history.state, '', `${location.pathname}${location.search}${path}${tail ? `?${tail}` : ''}`);
  }, []);
  return text ? <Toast onDone={() => setText(null)}>{text}</Toast> : null;
}
export function Archiv({ q }: { q: URLSearchParams }) {
  const { s } = useStore(); const u = Q.me(s)!; const iss = [...s.issues].sort((a, b) => b.monday.localeCompare(a.monday)).filter((i) => i.status !== 'open');
  if (!Q.atLeast(u.role, 'reviewer')) return <NotFound />;
  return <div className="lay full"><DownloadNotice q={q} /><div className="work arch-top"><header /></div><aside className="desk scroll shelfw"><div className="deskhd"><a className="back on-d" href="#/"><Ic n="back" />Zpět</a><h1 className="big m">Archiv porad</h1></div><div className="shelf">{iss.filter((i) => i.status === 'generated').map((i) => { const model = modelOf(s, i.monday); const titles = model ? model.sections.flatMap((x) => x.blocks).filter((b) => b.kind === 'point').slice(-3).map((b) => (b as { text: string }).text) : []; return <div className="bk" key={i.monday}><a className="pg" href={`#/archiv/${i.monday}`} aria-label={`Otevřít poradu ${Q.dm(i.meetingDate)}`}><span>Porada vedení školy</span><span className="ln">{titles.map((t) => <b key={t}>{t}</b>)}</span></a><span><b>{Q.dm(i.meetingDate)} {i.meetingDate.slice(0, 4)}</b><small>{i.doc ? counts(i.doc.points, 'bod', 'body', 'bodů') : ''}</small></span>{model ? <span className="lnks"><DocxBtn m={i.monday}>DOCX</DocxBtn>{i.doc?.pdf === 'ready' ? <a href={`#/archiv/${i.monday}`}>PDF</a> : i.doc?.pdf === 'rendering' ? <span>PDF se dělá</span> : <span>PDF chybí</span>}</span> : null}</div>; })}</div></aside></div>;
}
export function ArchivDoc({ m }: { m: string }) {
  const { s } = useStore(); const iss = Q.issueOf(s, m); const model = modelOf(s, m); if (!iss || !model) return <NotFound />;
  return <div className="lay full"><aside className="desk scroll"><div className="deskhd"><a className="back on-d" href="#/archiv"><Ic n="back" />Zpět na archiv</a><h1 className="big m">Porada {Q.dm(iss.meetingDate)}</h1><div className="row wr"><DocxBtn cls="btn go" m={m}>Stáhnout DOCX</DocxBtn>{iss.doc?.pdf === 'ready' ? <PdfBtn cls="btn" m={m} /> : null}</div><DocNav built={Q.builtOfModel(model)} /></div><Sheet built={Q.builtOfModel(model)} /></aside></div>;
}
