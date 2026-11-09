import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { foldForSearch, normalizeClass, parsePeopleList, suggestGenitive, type Salutation } from '@/domain/cs';
import { displayName, POINT_LIMITS, type DraftBullet, type DraftPerson, type PointContent } from '@/domain/report';
import { parseIsoDate, toIsoDate } from '@/domain/time';
import { points as copy } from '@/ui/copy/points';
import { fromText, go, toText, useStore } from '../core/react';
import * as Q from '../core/select';
import * as A from '../core/ops';
import type { Point } from '../core/types';
import { App, TitleField, goReplace, Desk, focusOn, Hash, Ic, Note, Saved, Seg, Sheet, WHEN } from './ui';
import { NotFound } from './home';

const SAL: readonly (readonly [Salutation, string])[] = [['pan', 'pan'], ['pani', 'paní'], ['slecna', 'slečna']];
type Step = { key: string; title: string };
function stepsFor(p: Point): Step[] {
  const s: Step[] = [];
  if (!p.akceId) s.push({ key: 'zaklad', title: 'O čem je zpráva' });
  s.push({ key: 'co', title: 'Jak to dopadlo' });
  p.content.bullets.forEach((b, i) => { if (b.kind === 'people' && b.key !== 'organisers' && b.key !== 'speakers') s.push({ key: `lide-${i}`, title: b.label }); if (b.kind === 'text') s.push({ key: `text-${i}`, title: b.label }); });
  const sts = Math.max(1, p.content.statements.length);
  for (let i = 0; i < sts; i++) s.push({ key: i ? `kdo-${i}` : 'kdo', title: 'Kdo se vyjádřil' }, { key: i ? `rekl-${i}` : 'rekl', title: 'Co řekl' });
  s.push({ key: 'hotovo', title: 'Kontrola' });
  return s;
}
function Dots({ n, of }: { n: number; of: number }) { return <div className="steps" role="img" aria-label={`Krok ${n} z ${of}`}>{Array.from({ length: of }, (_, k) => <span key={k} className={k < n ? 'on' : ''} />)}</div>; }

export function PeoplePick({ list, onAdd, placeholder, autoFocus }: { list: DraftPerson[]; onAdd: (p: DraftPerson[]) => void; placeholder: string; autoFocus?: boolean }) {
  const { s } = useStore(); const [v, set] = useState(''); const me = Q.me(s)!;
  const year = Q.yearOf(s);
  const known = useMemo(() => {
    const r = Q.peopleFor(s, me.id).map((x) => ({ ...x, how: 'uvedli jste v dřívější zprávě' }));
    const dir = s.users.filter((u) => u.role !== 'pending').map((u) => ({ salutation: u.salutation, givenName: u.givenName, familyName: u.familyName, ...(u.affiliation && { affiliation: u.affiliation, affiliationYear: year }), how: 'ze školního adresáře' }));
    const seen = new Set<string>();
    return [...r, ...dir].filter((x) => { const k = foldForSearch(`${x.givenName} ${x.familyName}`); if (seen.has(k) || list.some((l) => foldForSearch(displayName(l)) === k)) return false; seen.add(k); return true; });
  }, [s, me.id, list, year]);
  const f = foldForSearch(v.trim());
  const hits = f && !/[,;\n]/.test(v) ? known.filter((x) => foldForSearch(`${x.givenName} ${x.familyName}`).includes(f)).slice(0, 4) : [];
  const parsed = v.trim() ? parsePeopleList(Q.oneOnLine(v), known) : null;
  const addParsed = () => { if (!parsed || !parsed.rows.length) return; onAdd(parsed.rows.map((r) => ({ salutation: null, givenName: r.givenName, familyName: r.familyName, ...(r.titlesBefore && { titlesBefore: r.titlesBefore }), ...(r.titlesAfter && { titlesAfter: r.titlesAfter }), ...(r.affiliation && { affiliation: normalizeClass(r.affiliation) ?? r.affiliation, affiliationYear: year }) }))); set(''); };
  return <div className="stack st8">
    <label className="l"><span className="vh">Jména</span><textarea className="in bigi" rows={1} value={v} autoFocus={autoFocus} placeholder={placeholder} onBlur={() => { if (!hits.length && parsed?.rows.length && !parsed.rejected.length) addParsed(); }} onChange={(e) => set(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (hits.length === 1) { const { how: _h, ...h } = hits[0]!; onAdd([h as DraftPerson]); set(''); } else addParsed(); } }} /></label>
    {hits.length ? <div className="picks">{hits.map((h) => { const { how, ...x } = h; return <button type="button" className="pick" key={`${h.givenName}${h.familyName}`} onClick={() => { onAdd([x as DraftPerson]); set(''); }}><b>{h.givenName} {h.familyName}</b><span>{h.affiliation ? `${h.affiliation}, ` : ''}{how}</span></button>; })}</div> : null}
    {parsed?.rows.length ? <button type="button" className="btn lg w" onClick={addParsed}>{parsed.rows.length === 1 ? `Přidat: ${parsed.rows[0]!.givenName} ${parsed.rows[0]!.familyName}${parsed.rows[0]!.affiliation ? ` (${parsed.rows[0]!.affiliation})` : ''}` : `Přidat ${parsed.rows.length} ${parsed.rows.length < 5 ? 'lidi' : 'lidí'}`}</button> : null}
    {parsed?.rejected.length ? <p className="sm w-err" role="alert">Nerozumíme: {parsed.rejected.map((r) => r.source).join(', ')}. Chybí příjmení.</p> : null}
  </div>;
}
export function PersonRow({ p, onChange, onRemove }: { p: DraftPerson; onChange: (p: DraftPerson) => void; onRemove: () => void }) {
  const { s } = useStore(); const year = Q.yearOf(s);
  return <li className="pr"><div className="pr-h"><b>{displayName(p)}</b><input className="in cls" aria-label={`Třída nebo organizace: ${displayName(p)}`} placeholder="Třída" value={p.affiliation ?? ''} onChange={(e) => onChange({ ...p, affiliation: e.target.value, affiliationYear: year })} onBlur={(e) => { const c = normalizeClass(e.target.value); if (c) onChange({ ...p, affiliation: c, affiliationYear: year }); }} /><button type="button" className="x" aria-label={`Odebrat: ${displayName(p)}`} onClick={onRemove}><Ic n="x" /></button></div>
    <Seg label={`Oslovení: ${displayName(p)}`} value={p.salutation} options={SAL} onChange={(v) => onChange({ ...p, salutation: v })} /></li>;
}
export function Wizard({ id, step }: { id: string; step?: string }) {
  const { s, apply } = useStore(); const p = s.points.find((x) => x.id === id);
  const curRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => { curRef.current?.querySelector('.cur')?.scrollIntoView({ block: 'center', behavior: 'smooth' }); });
  if (!p) return <NotFound />;
  if (p.authorId !== s.userId) return <NotFound />;
  if (p.state !== 'draft' && p.state !== 'returned') { if (location.hash.includes('/psat/')) goReplace(`/zprava/${id}`); return null; }
  const steps = stepsFor(p); const key = step && steps.some((x) => x.key === step) ? step : steps[p.akceId ? 0 : 0]!.key;
  const k = steps.findIndex((x) => x.key === key); const cur = steps[k]!;
  const next = steps[k + 1]?.key, prev = steps[k - 1]?.key;
  const c = p.content; const set = (patch: Partial<PointContent>) => apply(A.savePoint(id, { ...c, ...patch }));
  const toStep = (x?: string) => go(x ? `/psat/${id}/${x}` : '/');
  const owed = p.akceId ? Q.owedBy(s, s.userId).find((o) => o.akce.id === p.akceId) : null;
  const target = p.akceId ? Q.owedMonday(s, s.futures.find((f) => f.id === p.akceId)!) : Q.toIsoDate(Q.handInTo(s).monday);
  const m = Q.issueOf(s, target) ? target : Q.workingMonday(s);
  const built = Q.buildDoc(s, m, { draft: { ...p, handInMonday: m } });
  const sheet = focusOn(built, id);
  const si = Number(/^(?:kdo|rekl)-(\d+)$/.exec(cur.key)?.[1] ?? 0); const sfx = si ? `-${si}` : '';
  const st0 = c.statements[si];
  const putSt = (x: PointContent['statements'][number]) => { const a = [...c.statements]; a[si] = x; set({ statements: a }); };
  const speakerName = st0?.speaker ? displayName(st0.speaker) : '';
  let ask: ReactNode = '', help: ReactNode = '', body: ReactNode = null, can = true, hint = '', nextText = 'Pokračovat';
  const body0 = toText(c.body);
  const banner = owed?.late ? <Note h={`Odevzdejte do ${Q.fromDay(WHEN(owed.close))}`}>Akce skončila až po uzávěrce, proto má zpráva vlastní čas. Vyjde v poradě {Q.dm(owed.monday)}</Note> : owed?.pastClose ? <Note h="Termín už minul">Porada {Q.dm(owed.monday)} na zprávu ještě čeká, takže se stihne.</Note> : !p.akceId && Q.toIsoDate(Q.handInTo(s).monday) !== Q.workingMonday(s) ? <Note h={`Půjde na poradu ${Q.dm(Q.handInTo(s).meetingDate)}`}>Uzávěrka porady {Q.dm(Q.working(s).meetingDate)} už minula.</Note> : null;
  if (cur.key === 'zaklad') {
    ask = 'O čem bude zpráva?'; help = 'Vyplňte základ a úvodní větu napíšeme za vás.';
    can = !!c.title.trim() && !!c.eventDate; hint = 'Napište název a datum.';
    body = <div className="stack">
      <label className="l">Jak se to jmenovalo<TitleField autoFocus value={c.title} onChange={(v) => set({ title: v })} placeholder="Například: Soutěž Robotiáda" /></label>
      <div className="two"><label className="l">Kdy<input className="in bigi" type="date" value={c.eventDate ? toIsoDate(c.eventDate) : ''} onChange={(e) => set({ eventDate: e.target.value ? parseIsoDate(e.target.value) : null })} /></label><label className="l">Kde<select className="in bigi" value={c.campus ?? 'jinde'} onChange={(e) => set({ campus: e.target.value as PointContent['campus'] })}><option value="smichov">Smíchov</option><option value="radlice">Radlice</option><option value="na-vidouli">Na Vidouli</option><option value="jinde">Jinde</option></select></label></div>
      <div className="stack st6"><span className="lb">Co to bylo</span><Seg label="Co to bylo" value={p.typeId} options={s.types.filter((t) => t.active).map((t) => [t.id, t.name] as const)} onChange={(v) => { const t = s.types.find((x) => x.id === v)!; apply(A.retype(id, { typeId: v })); const keep = new Map(c.bullets.map((b) => [b.key, b])); apply(A.savePoint(id, { ...c, bullets: t.bullets.map((b) => keep.get(b.key) ?? (b.kind === 'people' ? { key: b.key, label: b.label, kind: 'people', order: 'input', people: [] } : { key: b.key, label: b.label, kind: 'text', text: '' })) as DraftBullet[] })); }} /></div>
    </div>;
  } else if (cur.key === 'co') {
    ask = 'Jak to dopadlo?'; help = 'Stačí pár vět. Úvodní větu o tom, kdy a kde akce byla, jsme napsali za vás.';
    can = !!body0.trim(); hint = 'Napište aspoň jednu větu.';
    body = <><label className="l"><span className="vh">Jak to dopadlo</span><textarea className="in big" autoFocus value={body0} onChange={(e) => set({ body: fromText(e.target.value) })} placeholder="Například: Tým ze 3.B postoupil do celostátního kola." /></label>
      <details className="op"><summary>Upravit úvodní větu</summary><label className="l"><span className="vh">Úvodní věta</span><textarea className="in" value={c.opening} onChange={(e) => set({ opening: e.target.value, openingEdited: true })} /></label>{c.openingEdited ? <button type="button" className="q" onClick={() => apply(A.savePoint(id, { ...c, openingEdited: false }))}>Vrátit větu podle údajů o akci</button> : null}</details></>;
  } else if (cur.key.startsWith('lide-')) {
    const i = Number(cur.key.split('-')[1]); const bul = c.bullets[i] as Extract<DraftBullet, { kind: 'people' }>;
    const req = s.types.find((t) => t.id === p.typeId)?.bullets.find((b) => b.key === bul.key)?.required ?? false;
    const setPeople = (people: readonly DraftPerson[]) => set({ bullets: c.bullets.map((b, j) => (j === i ? { ...bul, people } : b)) });
    const noSal = bul.people.filter((x) => !x.salutation).length;
    ask = bul.key === 'participants' ? 'Kdo se účastnil?' : `${bul.label}?`; help = 'Napište jména, nebo vložte seznam třeba z Excelu. Třídu napište do závorky, například Tereza Malá (3.B).';
    can = (bul.people.length > 0 || !req) && noSal === 0; hint = bul.people.length === 0 && req ? 'Přidejte aspoň jednoho člověka.' : noSal ? `U ${noSal === 1 ? 'jednoho člověka' : `${noSal} lidí`} ještě vyberte oslovení. Nehádáme ho za vás.` : '';
    nextText = bul.people.length === 0 && !req ? 'Přeskočit' : 'Pokračovat';
    body = <>{noSal > 1 ? <button type="button" className="btn lg w" onClick={() => setPeople(bul.people.map((x) => (x.salutation ? x : { ...x, salutation: Q.guessSalutation(x) })))}>Doplnit oslovení podle jmen</button> : null}{noSal > 1 ? <p className="sm">Je to jen odhad, po doplnění je prosím zkontrolujte.</p> : null}<PeoplePick list={[...bul.people]} autoFocus placeholder="Například: Tereza Malá (3.B), Jakub Veselý (3.B)" onAdd={(x) => setPeople([...bul.people, ...x])} />{bul.people.length ? <ul className="prs">{bul.people.map((x, j) => <PersonRow key={j} p={x} onChange={(n) => setPeople(bul.people.map((y, q) => (q === j ? n : y)))} onRemove={() => setPeople(bul.people.filter((_, q) => q !== j))} />)}</ul> : null}</>;
  } else if (cur.key.startsWith('text-')) {
    const i = Number(cur.key.split('-')[1]); const bul = c.bullets[i] as Extract<DraftBullet, { kind: 'text' }>;
    ask = `${bul.label}?`; help = 'Nepovinné. Když není co psát, klidně přeskočte.'; nextText = bul.text.trim() ? 'Pokračovat' : 'Přeskočit';
    body = <label className="l"><span className="vh">{bul.label}</span><textarea className="in big" autoFocus value={bul.text} onChange={(e) => set({ bullets: c.bullets.map((b, j) => (j === i ? { ...bul, text: e.target.value } : b)) })} /></label>;
  } else if (cur.key.startsWith('kdo')) {
    ask = si ? 'Kdo další se vyjádřil?' : 'Kdo se k tomu vyjádřil?'; help = si ? 'Vyberte ho, co řekl, napíšete v dalším kroku.' : 'Každá zpráva má mít aspoň jedno vyjádření od někoho, kdo u toho byl. Vyberte ho, co řekl, napíšete v dalším kroku.';
    const inBullets = c.bullets.flatMap((b) => (b.kind === 'people' ? b.people : [])).filter((x) => x.familyName);
    const others = new Set(c.statements.filter((_, j) => j !== si).map((x) => (x.speaker ? displayName(x.speaker) : '')));
    const uniq = inBullets.filter((x, i, a) => a.findIndex((y) => displayName(y) === displayName(x)) === i && !others.has(displayName(x)));
    const pick = (x: DraftPerson) => { const g = x.salutation ? suggestGenitive({ salutation: x.salutation, givenName: x.givenName, familyName: x.familyName }) : null; putSt({ speaker: x, speakerGenitive: g?.text ?? '', ...(x.affiliation && { affiliation: x.affiliation }), quote: st0?.quote ?? '' }); };
    can = !!st0?.speaker && !!st0.speakerGenitive.trim() && !!st0.speaker.salutation; hint = st0?.speaker ? 'Zkontrolujte tvar jména.' : 'Vyberte člověka.';
    const g = st0?.speaker?.salutation ? suggestGenitive({ salutation: st0.speaker.salutation, givenName: st0.speaker.givenName, familyName: st0.speaker.familyName }) : null;
    const dropThis = si ? <button type="button" className="q r" onClick={() => { set({ statements: c.statements.filter((_, q) => q !== si) }); toStep('hotovo'); }}>Další vyjádření nepřidávat</button> : null;
    body = st0?.speaker ? <div className="stack st8">
      <div className="pick"><b>{speakerName}</b><span>{st0.speaker.affiliation ?? ''} <button type="button" className="q in-l" onClick={() => putSt({ speaker: null, speakerGenitive: '', quote: st0.quote })}>Změnit</button></span></div>
      {!st0.speaker.salutation ? <div className="stack st6"><span className="lb">Oslovení</span><Seg label="Oslovení" value={null} options={SAL} onChange={(v) => { const sp = { ...st0.speaker!, salutation: v }; pick(sp); }} /></div> : null}
      {st0.speaker.salutation ? <label className="l">Do dokumentu patří „vyjádření koho“{g?.needsCheck ? <small>Tvar jsme jen odhadli, prosím zkontrolujte ho.</small> : <small>Tvar jsme doplnili, opravte ho, jen když nesedí.</small>}<input className={`in bigi${g?.needsCheck ? ' chk-it' : ''}`} value={st0.speakerGenitive} onChange={(e) => putSt({ ...st0, speakerGenitive: e.target.value })} /></label> : null}
    </div> : <>{uniq.length ? <div className="picks">{uniq.map((x) => <button type="button" className="pick" key={displayName(x)} onClick={() => pick(x)}><b>{displayName(x)}</b><span>{x.affiliation ? `${x.affiliation}, ` : ''}je ve vaší zprávě</span></button>)}</div> : null}<PeoplePick list={uniq} placeholder="Někdo jiný? Začněte psát jméno" onAdd={(x) => pick(x[0]!)} />{dropThis}</>;
  } else if (cur.key.startsWith('rekl')) {
    ask = st0?.speaker ? `Co ${speakerName} řekl${st0.speaker.salutation === 'pan' ? '' : 'a'}?` : 'Co řekl?'; help = 'Může to být jedna věta i celý odstavec. V dokumentu vyjde jako jeden odstavec v uvozovkách, ty doplníme.';
    can = !!st0?.quote.trim(); hint = 'Napište, co řekl nebo řekla.';
    if (!st0?.speaker) { body = <Note>Nejdřív vyberte, kdo se vyjádřil. <a href={Hash(`/psat/${id}/kdo${sfx}`)}>Vybrat</a></Note>; can = false; }
    else body = <><label className="l"><span className="vh">Co řekl</span><textarea className="in big" autoFocus maxLength={POINT_LIMITS.quote} value={st0.quote} onChange={(e) => putSt({ ...st0, quote: e.target.value })} placeholder="Například: Robota jsme ladili až do poslední minuty." /></label>
      {POINT_LIMITS.quote - st0.quote.length < 300 ? <p className="sm" role="status">{Q.charsLeft(POINT_LIMITS.quote - st0.quote.length)}</p> : null}
      {can && c.statements.length < POINT_LIMITS.statements && si === c.statements.length - 1 ? <button type="button" className="btn lg w" onClick={() => { set({ statements: [...c.statements, { speaker: null, speakerGenitive: '', quote: '' }] }); go(`/psat/${id}/kdo-${c.statements.length}`); }}><Ic n="plus" />Přidat další vyjádření</button> : null}</>;
  } else {
    const r = Q.readiness(s, p); const try_ = A.trySubmit(s, id);
    ask = 'Takhle to vyjde. Můžeme to poslat?'; help = 'Vedení si to přečte a když bude něco chybět, ozve se vám. Do té doby to můžete vzít zpět.';
    can = try_.ok; nextText = Q.me(s)?.role === 'headmaster' ? 'Zařadit do porady' : 'Odeslat vedení';
    const ans = (t: string, v: ReactNode, to: string) => <div className="ans" key={`${t}${to}`}><span className="tx"><span className="st">{t}</span><span className="tt">{v}</span></span><a className="btn" href={Hash(`/psat/${id}/${to}`)} aria-label={`Změnit: ${t}`}>Změnit</a></div>;
    body = <>
      {r.problems.length ? <Note err h="Ještě chybí">{r.problems.map((x, i) => <span key={i} className="pl">{copy.readiness.problem(x.code, x.params)}</span>)}</Note> : null}
      {!try_.ok && try_.why === 'report-not-due' ? <Note err h="Porada už je vygenerovaná">Zprávu už nejde odeslat.</Note> : null}
      <div className="anss">
        {ans('Jak to dopadlo', body0 || 'Zatím nic', 'co')}
        {c.bullets.map((b, i) => (b.kind === 'people' && b.key !== 'organisers' && b.key !== 'speakers' ? ans(b.label, b.people.map(displayName).join(', ') || 'Nikdo', `lide-${i}`) : b.kind === 'text' ? ans(b.label, b.text || 'Nevyplněno', `text-${i}`) : null))}
        {(c.statements.length ? c.statements : [null]).map((x, j) => ans(c.statements.length > 1 ? `Vyjádření ${j + 1}` : 'Kdo se vyjádřil', x?.speaker ? <>{displayName(x.speaker)}: „{x.quote}“{c.statements.length > 1 ? <> <button type="button" className="q in-l r" onClick={() => set({ statements: c.statements.filter((_, q) => q !== j) })}>Odebrat</button></> : null}</> : 'Nikdo', j ? `kdo-${j}` : 'kdo'))}
      </div>
      {r.warnings.length ? <p className="sm">{copy.readiness.warning(r.warnings[0]!.code, r.warnings[0]!.params)}</p> : null}
    </>;
  }
  const n = k + 1; const of = steps.length;
  return <App nar noNav
    col={<>
      <div className="wzh"><a className="q" href="#/">Odejít, rozepsané zůstane uložené</a></div>
      <p className="stn">{c.title || 'Nová zpráva'}, krok {n} z {of}</p><Dots n={n} of={of} />
      {banner}
      <div className="top"><h1 className="ask">{ask}</h1>{help ? <p className="lead">{help}</p> : null}</div>
      {body}
      <div className="pv" aria-label="Takhle to vyjde v dokumentu"><p className="pvh">Takhle to vyjde</p><Sheet built={{ ...sheet, segments: sheet.segments.filter((x) => x.key === id) }} empty={null} /></div>
    </>}
    dock={<div className="dock">{!can && hint ? <p className="hint a">{hint}</p> : null}<div className="row wzb"><button type="button" className="btn lg" onClick={() => { if (si && cur.key.startsWith('kdo') && !st0?.speaker) set({ statements: c.statements.filter((_, q) => q !== si) }); toStep(prev); }}><Ic n="back" />Zpět</button><button type="button" className={`btn lg ${can ? 'go' : 'off'}`} aria-disabled={!can} onClick={() => { if (!can) return; if (cur.key === 'hotovo') { apply(A.submitPoint(id)); if (Q.me(s)?.role === 'headmaster') apply(A.approvePoint(id)); goReplace(`/zprava/${id}?fresh=1`); } else toStep(next); }}>{nextText}</button></div><Saved t={`Uloženo v ${Q.clock(p.savedAt).time}`} /></div>}
    desk={<Desk cls="tall wzd" note={<b>Takhle to vyjde v dokumentu</b>}><div className="wrapm wrapn" ref={curRef}><Sheet built={sheet} cls={(x) => (x.key === id ? 'cur live' : '')} empty={<div className="arch"><p className="center">Dokument se objeví, až vyplníte název a datum.</p></div>} /></div></Desk>} />;
}
/** A returned report: only what the reviewer asked for, then send again. */
export function Oprava({ id }: { id: string }) {
  const { s, apply } = useStore(); const p = s.points.find((x) => x.id === id); const [more, setMore] = useState(false);
  if (!p || p.authorId !== s.userId) return <NotFound />;
  const last = p.trail.filter((t) => t.what.startsWith('Vráceno')).at(-1);
  const name = Q.nameOf(Q.userById(s, last?.who ?? ''));
  const c = p.content; const sts = c.statements;
  const set = (patch: Partial<PointContent>) => apply(A.savePoint(id, { ...c, ...patch }));
  const m = p.handInMonday ?? Q.workingMonday(s);
  const built = focusOn(Q.buildDoc(s, m, { draft: p }), id);
  const can = A.trySubmit(s, id).ok;
  return <App nar noNav col={<>
    <div className="wzh"><a className="q" href="#/">Odejít, rozepsané zůstane uložené</a></div>
    <p className="stn">{c.title}</p>
    <div className="top"><h1 className="ask">{name || 'Vedení'} prosí o doplnění</h1></div>
    <Note h="Poznámka">{p.note}</Note>
    <label className="l">Text zprávy<textarea className="in big" value={toText(c.body)} onChange={(e) => set({ body: fromText(e.target.value) })} /></label>
    <div className="stack st8"><span className="lb">Vyjádření</span>{sts.map((x, i) => <div className="stmt" key={i}><label className="l">{x.speakerGenitive ? `Vyjádření ${x.speakerGenitive}` : 'Kdo'}<textarea className="in big" maxLength={POINT_LIMITS.quote} value={x.quote} onChange={(e) => set({ statements: sts.map((y, j) => (j === i ? { ...y, quote: e.target.value } : y)) })} /></label></div>)}
      {more ? <div className="stmt"><label className="l">Kdo (ve tvaru „koho“)<input className="in" autoFocus placeholder="ředitele školy" onBlur={(e) => { if (e.target.value.trim()) { set({ statements: [...sts, { speaker: { salutation: 'pan', givenName: '', familyName: e.target.value.trim() }, speakerGenitive: e.target.value.trim(), quote: '' }] }); setMore(false); } }} /></label></div> : <button type="button" className="q" onClick={() => setMore(true)}>Přidat další vyjádření</button>}
    </div>
    <a className="q" href={Hash(`/psat/${id}/hotovo`)}>Upravit ostatní části zprávy</a>
    <div className="pv"><p className="pvh">Takhle to vyjde</p><Sheet built={{ ...built, segments: built.segments.filter((x) => x.key === id) }} /></div>
  </>} dock={<div className="dock">{!can ? <p className="hint a">Vyplňte prosím text vyjádření.</p> : null}<div className="row wzb"><a className="btn lg" href="#/"><Ic n="back" />Zpět</a><button type="button" className={`btn lg ${can ? 'go' : 'off'}`} aria-disabled={!can} onClick={() => { if (!can) return; apply(A.submitPoint(id)); goReplace(`/zprava/${id}?fresh=1`); }}>Poslat znovu</button></div><Saved t={`Uloženo v ${Q.clock(p.savedAt).time}`} /></div>}
    desk={<Desk cls="tall wzd" note={<b>Takhle to vyjde v dokumentu</b>}><div className="wrapm wrapn"><Sheet built={built} cls={(x) => (x.key === id ? 'cur live' : '')} /></div></Desk>} />;
}
