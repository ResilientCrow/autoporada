import { useEffect, useMemo, useState } from 'react';
import { parseIsoDate, toIsoDate } from '@/domain/time';
import { POINT_LIMITS } from '@/domain/report';
import { createWith, go, Sheet, useStore } from '../core/react';
import type { DocumentModel } from '@/document/model';
import * as Q from '../core/select';
import * as A from '../core/ops';
import { NotFound } from './home';
import type { Row } from '../core/types';
import { OUTLINE_LIMITS, type Statement } from '@/domain/outline';
import { AnnexEditor, annexDoc, annexToText, DocNav, OutlineField } from '../core/parts';
import { App, Back, Desk, Dialog, goReplace, Ic, Item, Note, Saved, Sec, Seg, Stamp, Todo, Toast, Top, useNarrow, WHEN } from './ui';

const notYet = (n: number) => (n === 1 ? '1 zatím nevyjde, protože čeká na schválení' : n < 5 ? `${n} zatím nevyjdou, protože čekají na schválení` : `${n} zatím nevyjde, protože čeká na schválení`);
const useM = () => { const { s } = useStore(); return Q.workingMonday(s); };
const counts = (n: number, a: string, b: string, c: string) => (n === 1 ? `1 ${a}` : n < 5 ? `${n} ${b}` : `${n} ${c}`);
const ATT = { label: 'Čeká na vás', test: (i: Q.OutlineItem) => i.state === 'submitted' || i.kind === 'missing' };
let deskTop = 0;
function WholeDesk({ pending = true, note, focus }: { pending?: boolean; note?: string; focus?: (x: Q.Segment) => boolean }) {
  const { s } = useStore(); const m = useM(); const b = Q.buildDoc(s, m, { pending });
  const fk = focus ? b.segments.find(focus)?.key : undefined;
  // Coming back from a report lands where you left the long document, editing a point lands on that point.
  useEffect(() => { const d = document.querySelector<HTMLElement>('.desk.mg'); if (!d) return; if (fk) document.getElementById(`seg-${fk}`)?.scrollIntoView({ block: 'start' }); else d.scrollTop = deskTop; return () => { if (!fk) deskTop = d.scrollTop; }; }, [fk]);
  const open = (x: Q.Segment) => { if (x.kind === 'missing') go('/porada/zpravy'); else if (x.kind === 'report') go(x.state === 'submitted' ? `/kontrola/${x.key}` : `/zprava/${x.key}`); else if (x.kind === 'item') go(x.refId ? `/porada/pokyny/${x.refId}` : '/porada/pokyny'); };
  const label = (x: Q.Segment) => x.state === 'submitted' ? <span className="mn w">Čeká na kontrolu</span> : x.kind === 'missing' ? <span className="mn w">Chybí zpráva</span> : null;
  return <Desk cls="mg clip" fold={`Otevřít celý dokument, ${Q.pagesText(Q.pagesOf(b))}`} right={<DocNav built={b} attention={ATT} />} note={note ? <b>{note}</b> : <><b>Celý dokument, {Q.pagesText(Q.pagesOf(b))}.</b> Klikněte na část a upravte ji.</>}><div className="wrapm"><Sheet built={b} marginNote={label} onSeg={open} cls={(x) => `${x.state === 'submitted' ? 'np' : ''}${x.key === fk ? ' cur' : ''}`} /></div></Desk>;
}
const Jr = ({ n, t, why, to, a, st }: { n: number; t: string; why: string; to: string; a?: string; st: 'c' | 'd' | '' }) => <li className={st}><a href={`#${to}`}><i>{st === 'd' ? <Ic n="chk" /> : n}</i><span className="tx"><b>{t}</b><span>{why}</span></span>{a ? <span className="btn">{a}</span> : null}</a></li>;
export function Porada({ over: overP }: { over?: boolean }) {
  const { s } = useStore(); const m = useM(); const iss = Q.issueOf(s, m); const sl = Q.working(s);
  const [skip, setSkip] = useState(!!overP);
  if (!iss) return <PoradaVirtual m={m} />;
  const whole = Q.buildDoc(s, m, { pending: true });
  const q = Q.queuePoints(s).length + Q.queueFutures(s).length;
  const newRows = iss.rows.filter((r) => r.isNew).length;
  const miss = Q.owedTo(s, m).filter((o) => !o.delivered && !o.notYetOver);
  const talent = s.registry.find((l) => l.purpose === 'annex1');
  const steps = [
    { t: q ? `Zkontrolovat ${counts(q, 'položku', 'položky', 'položek')}` : 'Všechno je zkontrolované', why: 'Co neschválíte, nevyjde.', to: '/kontrola', a: q ? 'Začít' : '', done: !q },
    { t: newRows ? `Zařadit ${counts(newRows, 'schválený návrh', 'schválené návrhy', 'schválených návrhů')}` : 'Pokyny a hospodaření', why: newRows ? iss.rows.filter((r) => r.isNew).map((r) => r.title).join(', ') : 'Převzato z minulé porady.', to: '/porada/pokyny', a: newRows ? 'Zařadit' : '', done: !newRows },
    { t: miss.length ? `Doplnit ${counts(miss.length, 'chybějící zprávu', 'chybějící zprávy', 'chybějících zpráv')}` : 'Zprávy z akcí jsou všechny', why: miss.length ? 'Jinak se vytiskne jen krátký odstavec o akci.' : 'Nic nechybí.', to: '/porada/zpravy', a: miss.length ? 'Doplnit' : '', done: !miss.length },
    { t: 'Přítomní a hosté', why: iss.present ? 'Převzato z minulé porady.' : 'Přítomní nejsou vyplnění.', to: '/porada/udaje', a: iss.present ? '' : 'Vyplnit', done: !!iss.present },
    { t: iss.annexes.length ? `Přílohy: ${iss.annexes.length + 1}` : 'Přílohy', why: iss.annexes.length ? ['Příloha 1 ze seznamu studentů', ...iss.annexes.map((a) => a.title || 'Bez názvu')].join(', ') : 'Jen Příloha 1 ze seznamu studentů.', to: '/porada/prilohy', a: '', done: true },
    { t: 'Seznamy studentů', why: talent?.entries.some((e) => e.isNew) ? `Noví studenti v Příloze 1: ${talent.entries.filter((e) => e.isNew).length}.` : 'Beze změny od minulé porady.', to: '/seznamy', a: '', done: true },
    { t: 'Vygenerovat dokument', why: 'Nakonec zkontrolujete celý náhled.', to: '/porada/nahled', a: 'Otevřít náhled', done: false },
  ];
  const first = steps.findIndex((x) => !x.done);
  const reqs = Q.pendingRequests(s);
  return <App desk={<WholeDesk />} over={skip ? <SkipDialog m={m} onClose={() => setSkip(false)} /> : null} col={<>
    <Top big h={`Porada ${Q.dm(iss.meetingDate)}`} lead={<>Termín pro učitele je <b>{WHEN(iss.deadlineAt)}</b>{new Date(iss.deadlineAt) < new Date(s.now) ? ', už minul' : ''}. V dokumentu je {whole.points} bodů, {Q.pagesText(Q.pagesOf(whole))}{whole.points > Q.buildDoc(s, m).points ? `. Z toho ${notYet(whole.points - Q.buildDoc(s, m).points)}` : ''}.</>} />
    <ol className="jr">{steps.map((x, i) => <Jr key={x.t} n={steps.slice(0, i + 1).filter((y) => !y.done).length} t={x.t} why={x.why} to={x.to} {...(x.a ? { a: x.a } : {})} st={x.done ? 'd' : i === first ? 'c' : ''} />)}</ol>
    <button type="button" className="add" onClick={() => go('/pridat')}><span>Přidat do porady</span><b><Ic n="plus" /></b></button>
    {reqs.length ? <Sec h="Žádosti o přístup"><Item to="/lide" t={reqs.map((r) => r.name).join(' a ')} st="Čekají na vaše rozhodnutí" mk="o" /></Sec> : null}
    <Sec h="Další porady">{Q.slotsOf(s).filter((x) => Q.toIsoDate(x.monday) > m).slice(0, 3).map((x) => <Item key={Q.toIsoDate(x.monday)} t={Q.dm(x.meetingDate)} st={x.status === 'skipped' ? 'Nekoná se' : `Uzávěrka ${WHEN(x.deadlineAt)}`} />)}</Sec>
    {sl.status === 'open' ? <button type="button" className="q" onClick={() => setSkip(true)}>Tato porada se nekoná</button> : null}
  </>} />;
}
function PoradaVirtual({ m }: { m: string }) { return <App col={<Top big h={`Porada ${Q.dm(m)}`} lead="Tato porada se začne připravovat, až do ní někdo něco pošle." />} />; }
const REFUSE: Record<string, string> = { early: 'Ten den už patří dřívější poradě.', late: 'Tak daleko dopředu kalendář nesahá.', same: 'Na ten den porada už je.', skipped: 'Na ten den připadá porada, která se nekoná.', 'deadline-past': 'Uzávěrka by tím už minula, a teď je ještě otevřená.', 'meeting-order': 'Pořadí porad by tím přestalo sedět.' };
export function SkipDialog({ m, onClose }: { m: string; onClose: () => void }) {
  const { s, apply } = useStore(); const [d, set] = useState(() => new Date(Date.parse(`${m}T12:00:00Z`) + 7 * 864e5).toISOString().slice(0, 10));
  const plan = useMemo(() => { try { return A.planSkip(s, m, parseIsoDate(d)); } catch { return null; } }, [s, m, d]);
  const newly = plan?.ok ? Q.newlyOwed(s, m, parseIsoDate(d)) : 0; const owedMore = newly ? ` Do té doby skončí ${newly === 1 ? '1 akce, její zpráva pak patří' : newly < 5 ? `${newly} akce, jejich zprávy pak patří` : `${newly} akcí, jejich zprávy pak patří`} do této porady.` : '';
  const effect = !plan ? 'Vyberte den.' : !plan.ok ? REFUSE[plan.refusal] : plan.plan.skipped.length ? `${plan.plan.skipped.length > 1 ? 'Porady' : 'Porada'} ${plan.plan.skipped.map((x) => Q.dm(x.monday)).join(', ')} se ${plan.plan.skipped.length > 1 ? 'nekonají' : 'nekoná'}. Další bude ${Q.dm(d)}, uzávěrka ${WHEN(plan.plan.held.deadlineAt)}. Body a přílohy se přesunou.${owedMore}` : `Porada se přesune na ${Q.dm(d)}, uzávěrka ${WHEN(plan.plan.held.deadlineAt)}.${owedMore}`;
  return <Dialog title="Kdy bude další porada?" onClose={onClose}><p>Vyberte den. Řekneme vám, co to udělá.</p><label className="l">Den<input className="in bigi" type="date" value={d} onChange={(e) => set(e.target.value)} /></label><div className={`fx${plan && !plan.ok ? ' bad' : ''}`} role="status">{effect}</div><button type="button" className={`btn lg w ${plan?.ok ? 'dk' : 'off'}`} aria-disabled={!plan?.ok} onClick={() => { if (plan?.ok) { apply(A.setSkipped(m, parseIsoDate(d))); onClose(); } }}>Potvrdit</button></Dialog>;
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
/** Příloha 1 comes from the student list; everything else is written here and starts on its own page. */
export function Prilohy({ id }: { id?: string }) {
  const { s, apply } = useStore(); const m = useM(); const iss = Q.issueOf(s, m)!; const [rm, setRm] = useState(false);
  const annex = iss.annexes.find((a) => a.id === id); const k = annex ? iss.annexes.indexOf(annex) : -1;
  const talent = s.registry.find((l) => l.purpose === 'annex1');
  if (id && !annex) return <NotFound />;
  if (annex) {
    const name = `Příloha ${k + 2}`;
    return <App nar over={rm ? <Dialog title={`Odebrat přílohu ${k + 2}?`} onClose={() => setRm(false)}><p>Zmizí z této porady i s textem, tabulkami a obrázky. Další přílohy se přečíslují.</p><div className="row"><button className="btn lg" onClick={() => setRm(false)}>Nechat</button><button className="btn dk lg" onClick={() => { apply(A.removeAnnex(m, annex.id)); go('/porada/prilohy'); }}>Odebrat</button></div></Dialog> : null}
      desk={<WholeDesk note="Takhle to teď vypadá. Přeškrtnuté zatím nevyjde." focus={(x) => x.blocks.some((b) => b.kind === 'annex' && b.text === `PŘÍLOHA ${k + 2}`)} />} col={<><Back to="/porada/prilohy" t="Zpět na přílohy" /><Top h={annex.title || name} lead="Začne na nové stránce. Ukládá se to samo." />
        <AnnexEditor n={k + 2} annex={annex} onChange={(a) => apply(A.saveAnnex(m, a))} /><button type="button" className="q r" onClick={() => setRm(true)}>Odebrat přílohu</button></>} />;
  }
  return <App nar desk={<WholeDesk note="Takhle to teď vypadá. Přeškrtnuté zatím nevyjde." />} col={<><Back to="/porada" t="Zpět na poradu" /><Top h="Přílohy" lead="Tisknou se za podpisem, v tomto pořadí. Každá začíná na nové stránce." />
    <Sec h="Příloha 1"><Item to={`/seznamy/${talent?.key ?? ''}`} t={talent?.name ?? 'Seznam studentů'} st={`Ze seznamu, ${talent?.entries.length ?? 0} studentů`} /></Sec>
    {iss.annexes.length ? <Sec h="Další přílohy">{iss.annexes.map((a, i) => <div className="rowi" key={a.id}><div className="updn"><button type="button" aria-label={`Posunout výš: ${a.title}`} onClick={() => apply(A.moveAnnex(m, a.id, -1))}><Ic n="up" /></button><button type="button" aria-label={`Posunout níž: ${a.title}`} onClick={() => apply(A.moveAnnex(m, a.id, 1))}><Ic n="down" /></button></div><a className="tx" href={`#/porada/prilohy/${a.id}`}><span className="tt">Příloha {i + 2}: {a.title || 'bez názvu'}</span><span className="st">{a.parts.map((p) => ({ text: 'text', table: 'tabulka', image: 'obrázek' }[p.kind])).join(', ') || 'Zatím prázdná'}</span></a></div>)}</Sec> : null}
    <button type="button" className="btn lg w" onClick={() => { let n = ''; apply(A.addAnnex(m, (x) => (n = x))); setTimeout(() => go(`/porada/prilohy/${n}`)); }}><Ic n="plus" />Přidat přílohu</button></>} />;
}
/** Every list of the document, in its order: the headmaster's way to put anything in, with no approval step. */
export function Pridat() {
  const { s, apply } = useStore(); const m = useM(); const iss = Q.issueOf(s, m); const rows = iss?.rows ?? [];
  const future = (k: 'akce' | 'jednani', term?: boolean) => { const id = createWith(apply, s, (cb) => A.createFuture(k, cb)); if (term) apply(A.saveFuture(id, { campus: 'jinde', responsible: { verb: 'vede', people: [] } })); go(`/nova-akce/${id}`); };
  const report = () => { const id = createWith(apply, s, (cb) => A.createPoint('report', 'jine', null, cb)); go(`/psat/${id}/zaklad`); };
  const item = (r: Row) => {
    if (r.slot === 'meetings') return <Item key={r.id} act={() => future('jednani')} t={r.title} st="Přidat jednání" />;
    if (r.slot === 'events') return <Item key={r.id} act={() => future('akce')} t={r.title} st="Přidat akci" />;
    if (r.slot === 'talent' || r.slot === 'exemptions') return <Item key={r.id} to="/seznamy" t={r.title} st="Přidat studenta do seznamu" />;
    return <Item key={r.id} to={`/porada/pokyny/${r.id}`} t={r.title} st={r.slot === 'partners' ? `Přidat ohlas, teď ${r.quotes.length}` : r.pointId ? 'Schválený návrh' : 'Doplnit odrážku nebo text'} />;
  };
  const section = (k: Row['section'], h: string) => <Sec h={h}>{rows.filter((r) => r.section === k).map(item)}<Item to={`/porada/pokyny-novy?sekce=${k}`} t="Nový bod" st="Vlastní nadpis, text a odrážky" />{k === 'pokyny' ? <Item to="/seznamy" t="Nový seznam studentů" st="Vyjde v bodě o uvolnění z výuky" /> : null}</Sec>;
  return <App {...(iss ? { desk: <WholeDesk note="Takhle to teď vypadá. Přeškrtnuté zatím nevyjde." /> } : {})} col={<>
    <Back to="/porada" t="Zpět na poradu" /><Top h="Přidat do porady" lead="Vyberte seznam. Jde to rovnou do porady, bez schvalování." />
    {iss ? <>{section('pokyny', 'Pokyny')}{section('hospodareni', 'Hospodaření')}</> : <Sec h="Pokyny"><Item act={() => future('jednani')} t="Jednání" st="Přidat jednání" /><Item act={() => future('akce')} t="Akce" st="Přidat akci" /></Sec>}
    <Sec h="Provoz školy">
      <Item act={report} t="Zpráva o tom, co proběhlo" st="Vlastní bod s účastníky a vyjádřením" />
      <Item act={() => future('akce')} t="Další doposud známé akce" st="Přidat akci, podle data se zařadí sama" />
      <Item act={() => future('jednani', true)} t="Termín bez organizátora" st="Prázdniny a podobně, zprávu po něm nikdo nepíše" />
    </Sec>
    {iss ? <Sec h="Záhlaví a přílohy"><Item to="/porada/udaje" t="Přítomní a hosté" /><Item to="/porada/prilohy" t="Přílohy" st="Text, tabulka nebo obrázek" /></Sec> : null}
  </>} />;
}
export function Pokyny({ rowId, adding, section }: { rowId?: string; adding?: boolean; section?: 'pokyny' | 'hospodareni' }) {
  const { s, apply } = useStore(); const m = useM(); const iss = Q.issueOf(s, m)!;
  const row = iss.rows.find((r) => r.id === rowId);
  const [title, setT] = useState(row?.title ?? ''); const [body, setB] = useState(row ? annexToText(row.body) : ''); const [per, setP] = useState<'standing' | 'once'>(row?.persistence ?? 'once'); const [sec, setSec] = useState<'pokyny' | 'hospodareni'>(row?.section ?? section ?? 'pokyny');
  const partners = row?.slot === 'partners'; const [quotes, setQ] = useState<Statement[]>(row?.quotes ?? []); const putQ = (i: number, p: Partial<Statement>) => setQ(quotes.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const qOk = quotes.every((q) => q.speakerGenitive.trim() && q.quote.trim()); const canSave = !!title.trim() && qOk;
  const cleanQ = (): Statement[] => quotes.map((q) => ({ speakerGenitive: q.speakerGenitive.trim(), quote: q.quote.trim(), ...(q.affiliation?.trim() ? { affiliation: q.affiliation.trim() } : {}) }));
  const SECT = (k: 'pokyny' | 'hospodareni', h: string) => <Sec h={h}>{iss.rows.filter((r) => r.section === k).map((r) => <div className={`rowi${r.isNew ? ' nw-r' : ''}`} key={r.id}>
    <div className="updn"><button type="button" aria-label={`Posunout výš: ${r.title}`} onClick={() => apply(A.moveRow(m, r.id, -1))}><Ic n="up" /></button><button type="button" aria-label={`Posunout níž: ${r.title}`} onClick={() => apply(A.moveRow(m, r.id, 1))}><Ic n="down" /></button></div>
    <a className="tx" href={`#/porada/pokyny/${r.id}`}><span className="tt">{r.title}</span><span className="st">{r.slot === 'meetings' || r.slot === 'events' ? 'Plní se samo z akcí' : r.slot === 'talent' || r.slot === 'exemptions' ? 'Plní se ze seznamů studentů' : r.isNew ? 'Nově schválený návrh' : r.persistence === 'standing' ? 'Trvalý bod' : 'Jen pro tuto poradu'}</span></a>
    {r.isNew && iss.rows.filter((x) => x.section === k).length > 1 ? <div className="plc"><label className="l sm">Zařadit za bod<select className="in" value="" onChange={(e) => e.target.value && apply(A.placeRowAfter(m, r.id, e.target.value))}><option value="">Vyberte bod</option>{iss.rows.filter((x) => x.section === k && x.id !== r.id).map((x) => <option key={x.id} value={x.id}>{x.title.length > 60 ? `${x.title.slice(0, 60)}…` : x.title}</option>)}</select></label><button type="button" className="q" onClick={() => apply(A.placeRow(m, r.id))}>Nechat na konci</button></div> : null}
  </div>)}</Sec>;
  if (row || adding) {
    const proposal = row?.pointId ?? null;
    const gen = row && (proposal || row.slot === 'meetings' || row.slot === 'events' || row.slot === 'talent' || row.slot === 'exemptions');
    const done = () => go('/porada/pokyny');
    return <App nar desk={<WholeDesk note="Takhle to teď vypadá. Přeškrtnuté zatím nevyjde." {...(row ? { focus: (x: Q.Segment) => x.refId === row.id } : {})} />} dock={gen ? undefined : <div className="dock">{!qOk ? <p className="hint a">U každého ohlasu vyplňte, kdo ho napsal, a jeho text.</p> : null}<div className="row"><button type="button" className={`btn lg ${canSave ? 'go' : 'off'}`} aria-disabled={!canSave} onClick={() => { if (!canSave) return; if (row && partners) apply(A.saveRow(m, row.id, { title, quotes: cleanQ(), persistence: per })); else if (row) apply(A.saveRow(m, row.id, { title, body: annexDoc(body), persistence: per })); else apply(A.addRow(m, sec, title, annexDoc(body), per)); done(); }}>Uložit</button></div></div>} col={<>
      <Back to="/porada/pokyny" t="Zpět na pokyny" /><Top h={adding ? 'Nový bod' : row!.title} {...(gen ? { lead: proposal ? 'Text schváleného návrhu se upravuje v kontrole, tady ho lze jen přesunout.' : row!.slot === 'talent' || row!.slot === 'exemptions' ? 'Tento bod se plní ze seznamů studentů.' : 'Tento bod se plní sám ze schválených akcí.' } : {})} />
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
export function Zpravy() {
  const { s, apply } = useStore(); const m = useM(); const list = Q.owedTo(s, m); const [ed, setEd0] = useState<string | null>(null); const [t, setT] = useState(''); const [last, setLast] = useState<string | null>(null); const setEd = (x: string | null) => { setEd0(x); if (x) setLast(x); };
  const missing = list.filter((o) => !o.delivered);
  return <App nar desk={<WholeDesk note="Takhle to teď vypadá. Přeškrtnuté zatím nevyjde." {...(last ? { focus: (x: Q.Segment) => x.refId === last } : {})} />} col={<>
    <Back to="/porada" t="Zpět na poradu" />
    <Top h="Chybějící zprávy" lead={missing.length ? `Chybí ${missing.filter((o) => !o.notYetOver).length}, u dalších ${missing.filter((o) => o.notYetOver).length} akce ještě neskončila. Kde zpráva nebude, vytiskneme tento odstavec. Můžete ho přepsat.` : 'Nic nechybí, všechny zprávy jsou schválené.'} />
    {missing.map((o) => { const custom = !!Q.issueOf(s, m)!.placeholders[o.akce.id]; return <section className="stack st8 mz" key={o.akce.id}><h2>{o.akce.title}</h2><p className="sm">{o.notYetOver ? 'Akce ještě neskončila.' : o.point ? `Zpráva je ${o.point.state === 'submitted' ? 'u kontroly' : o.point.state === 'returned' ? 'vrácená autorovi' : 'rozepsaná'}.` : `Autor: ${Q.nameOf(Q.userById(s, o.akce.authorId))}, zatím nezačal.`}</p>
      {ed === o.akce.id ? <><label className="l"><span className="vh">Odstavec</span><textarea className="in" autoFocus value={t} onChange={(e) => setT(e.target.value)} /></label><div className="row"><button className="btn" onClick={() => setEd(null)}>Zpět</button><button className={`btn ${t.trim() ? 'go' : 'off'}`} onClick={() => { if (t.trim()) { apply(A.setPlaceholder(m, o.akce.id, t)); setEd(null); } }}>Uložit</button></div></> : <><p className="ppar">{Q.placeholderText(s, o.akce, m)}</p><div className="row wr"><button className="btn" onClick={() => { setEd(o.akce.id); setT(Q.placeholderText(s, o.akce, m)); }}>Přepsat odstavec</button>{custom ? <button className="q" onClick={() => { setLast(o.akce.id); apply(A.setPlaceholder(m, o.akce.id, null)); }}>Vrátit původní text</button> : null}</div></>}</section>; })}
  </>} />;
}
export function Nahled() {
  const { s, apply } = useStore(); const m = useM(); const iss = Q.issueOf(s, m)!; const checks = Q.preflight(s, m); const [dlg, setDlg] = useState(false); const [tick, setTick] = useState(false); const [skipFor, setSkipFor] = useState<string | null>(null);
  const blocked = checks.some((c) => c.level === 'block'); const b = Q.buildDoc(s, m, { pending: true }); const printed = Q.buildDoc(s, m); const narrow = useNarrow(); const [openDoc, setOpenDoc] = useState(false);
  const link = (to?: string) => (to === 'kontrola' ? '#/kontrola' : to === 'zpravy' ? '#/porada/zpravy' : to === 'pokyny' ? '#/porada/pokyny' : to === 'udaje' ? '#/porada/udaje' : to === 'seznamy' ? '#/seznamy' : undefined);
  const rows = checks.map((c) => ({ k: (c.level === 'ok' ? 'd' : c.level === 'block' ? 'x' : 'n') as 'd' | 'x' | 'n', t: link(c.to) ? <a href={link(c.to)}>{c.text}</a> : c.to && /^\d{4}-\d{2}-\d{2}$/.test(c.to) ? <a href="#" role="button" onClick={(e) => { e.preventDefault(); setDlg(false); setSkipFor(c.to!); }}>{c.text}</a> : c.text }));
  return <App nar over={skipFor ? <SkipDialog m={skipFor} onClose={() => setSkipFor(null)} /> : dlg ? <Dialog title="Vygenerovat dokument?" onClose={() => setDlg(false)}><Todo rows={rows.filter((r) => r.k !== 'd')} /><div className="fx">{printed.points} bodů vyjde, zveřejní se a dokument si stáhne vedení.</div><label className="chk"><input type="checkbox" checked={tick} onChange={(e) => setTick(e.target.checked)} />Rozumím, poradu pak nelze změnit.</label><button type="button" className={`btn lg w ${tick ? 'go' : 'off'}`} aria-disabled={!tick} onClick={() => { if (!tick) return; apply(A.generate(m)); goReplace(`/hotovo/${m}`); }}>Vygenerovat a zveřejnit</button></Dialog> : null}
    dock={<div className="dock">{blocked ? <p className="hint a">Nejdřív vyřešte, co je výše červeně.</p> : null}<div className="row"><button type="button" className={`btn lg ${blocked ? 'off' : 'go'}`} aria-disabled={blocked} onClick={() => !blocked && (setTick(false), setDlg(true))}>Vygenerovat a zveřejnit</button></div></div>}
    desk={narrow ? undefined : <Desk cls="mg clip" right={<DocNav built={b} attention={ATT} />} note={<b>Takhle vyjde, když vygenerujete teď</b>}><div className="wrapm"><Sheet built={b} cls={(x) => (x.state === 'submitted' ? 'np' : '')} marginNote={(x) => (x.state === 'submitted' ? <span className="mn w">Neschváleno, teď by nevyšlo</span> : x.kind === 'missing' ? <span className="mn w">Chybí zpráva, vytiskne se odstavec</span> : null)} /></div></Desk>}
    col={<><Back to="/porada" t="Zpět na poradu" /><Top h="Náhled porady" lead={`Jde do něj ${printed.points} bodů, ${Q.pagesText(Q.pagesOf(b))}. Přeškrtnuté zatím nevyjde.`} /><Sec h="Před generováním"><Todo rows={rows} /></Sec>{narrow ? (openDoc ? <><DocNav built={b} attention={ATT} /><div className="pv"><p className="pvh">Dokument</p><Sheet built={b} cls={(x) => (x.state === 'submitted' ? 'np' : '')} /></div></> : <button type="button" className="btn lg w" onClick={() => setOpenDoc(true)}>Otevřít celý dokument</button>) : null}<p className="sm" hidden>{iss.monday}</p></>} />;
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
    <Top h={`Hotovo. Porada ${Q.dm(iss.meetingDate)} je na světě.`} lead={`Vyšlo ${iss.doc.points} bodů. Autoři své zprávy uvidí jako zveřejněné.`} />
    <div className="stack st8"><DocxBtn cls="btn go lg w" m={m}>Stáhnout DOCX</DocxBtn>
      {pdf === 'rendering' ? <div className="btn off lg w" role="status">PDF se připravuje…</div> : pdf === 'failed' ? <><Note err h="PDF se nepovedlo">DOCX je v pořádku. PDF zkuste vytvořit znovu.</Note></> : <PdfBtn cls="btn lg w" m={m} />}
    </div>
    {iss.doc.left?.moved.length ? <Note h={`Nevyšlo, čeká na další poradu: ${iss.doc.left.moved.length}`}>{iss.doc.left.moved.join(', ')}. Vedení to dál může zkontrolovat.</Note> : null}{iss.doc.left?.missed.length ? <Note h={`Vyšlo jen jako krátký odstavec: ${iss.doc.left.missed.length}`}>{iss.doc.left.missed.join(', ')}. Zpráva z těchto akcí nedorazila včas.</Note> : null}
    <a className="q" href="#/archiv">Otevřít archiv</a><a className="q" href="#/porada">Na další poradu</a>
  </>} />;
}
export function Archiv() {
  const { s, apply } = useStore(); const u = Q.me(s)!; const iss = [...s.issues].sort((a, b) => b.monday.localeCompare(a.monday)).filter((i) => i.status !== 'open');
  if (!Q.atLeast(u.role, 'reviewer')) return <NotFound />;
  return <div className="lay full"><div className="work arch-top"><header /></div><aside className="desk scroll shelfw"><div className="deskhd"><a className="back on-d" href="#/"><Ic n="back" />Zpět</a><h1 className="big m">Archiv porad</h1></div><div className="shelf">{iss.map((i) => { const model = i.status === 'generated' ? modelOf(s, i.monday) : null; const titles = model ? model.sections.flatMap((x) => x.blocks).filter((b) => b.kind === 'point').slice(-3).map((b) => (b as { text: string }).text) : []; return <div className="bk" key={i.monday}><a className="pg" href={i.status === 'generated' ? `#/archiv/${i.monday}` : '#/archiv'} aria-label={`Otevřít poradu ${Q.dm(i.meetingDate)}`}><span>Porada vedení školy</span><span className="ln">{titles.map((t) => <b key={t}>{t}</b>)}</span></a><span><b>{Q.dm(i.meetingDate)} {i.meetingDate.slice(0, 4)}</b><small>{i.status === 'skipped' ? 'Nekonala se' : `${i.doc?.points ?? ''} bodů`}</small></span>{i.status === 'generated' && model ? <span className="lnks"><DocxBtn m={i.monday}>DOCX</DocxBtn>{i.doc?.pdf === 'ready' ? <a href={`#/archiv/${i.monday}`}>PDF</a> : i.doc?.pdf === 'rendering' ? <span>PDF se dělá</span> : <span>PDF chybí</span>}</span> : u.role === 'headmaster' && i.status === 'skipped' && !s.issues.some((x) => x.status === 'generated' && x.monday > i.monday) ? <span className="lnks"><button onClick={() => apply(A.unskip(i.monday))}>Porada se koná</button></span> : null}</div>; })}</div></aside></div>;
}
export function ArchivDoc({ m }: { m: string }) {
  const { s } = useStore(); const iss = Q.issueOf(s, m); const model = modelOf(s, m); if (!iss || !model) return <NotFound />;
  return <div className="lay full"><aside className="desk scroll"><div className="deskhd"><a className="back on-d" href="#/archiv"><Ic n="back" />Zpět na archiv</a><h1 className="big m">Porada {Q.dm(iss.meetingDate)}</h1><div className="row wr"><DocxBtn cls="btn go" m={m}>Stáhnout DOCX</DocxBtn>{iss.doc?.pdf === 'ready' ? <PdfBtn cls="btn" m={m} /> : null}</div><DocNav built={Q.builtOfModel(model)} /></div><Sheet built={Q.builtOfModel(model)} /></aside></div>;
}
export { Saved, toIsoDate, parseIsoDate };
