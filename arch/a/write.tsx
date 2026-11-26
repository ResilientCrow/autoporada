import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { foldForSearch, normalizeClass, parsePeopleList, participantsLabel, headedName, placePhrase, type ReportAddress, type Salutation } from '@/domain/cs';
import { displayName, draftPersonOf, organiserAt, PARTICIPANTS_KEY, POINT_LIMITS, REPORT_BULLETS, samePerson, type DraftBullet, type DraftPerson, type PointContent } from '@/domain/report';
import { compareDates, parseIsoDate, toIsoDate } from '@/domain/time';
import { points as copy } from '@/ui/copy/points';
import { fromText, go, toText, useStore } from '../core/react';
import * as Q from '../core/select';
import { directoryPerson } from '../core/directory';
import * as A from '../core/ops';
import type { Point } from '../core/types';
import { App, REPORT_ADDRESS_OPTIONS, TitleField, goReplace, Desk, Dialog, focusOn, Hash, Ic, Note, Rework, Saved, Seg, Sheet, SheetPicker, WHEN, type Said } from './ui';
import { loadChunk } from '../core/import/chunk';
import { NO_NAMES, PEOPLE_SHEET_HINT, tooManyPeople } from '../core/import/messages';
import { NotFound } from './home';

const SAL: readonly (readonly [Salutation, string])[] = [['pan', 'pan'], ['pani', 'paní'], ['slecna', 'slečna']];
type Step = { key: string; title: string };
type Statement = PointContent['statements'][number];
/** Under Kde přesně: how the place reads in the opening sentence (ADR 0069). */
function placeLine(place: string) {
  const read = placePhrase(place);
  if (read.kind !== 'named') return read.text ? <small>Ve větě: {read.text}.</small> : null;
  return <small className="w-err">Tohle místo neumíme vyskloňovat, ve větě proto stojí „{read.text}“. Když to nesedí, napište místo tak, jak má být ve větě, třeba „na Pražském hradě“.</small>;
}

function statementOf(x: DraftPerson, quote: string): Statement {
  const g = Q.genitiveFor(x);
  return { speaker: x, speakerGenitive: g?.text ?? '', ...(x.affiliation && { affiliation: x.affiliation }), quote };
}
/** Puts x's statement first: their later one moves up, a first one without a speaker becomes theirs, and one by someone else moves after it. Null when nothing changes or there is no room. */
function leadBy(sts: readonly Statement[], x: DraftPerson): Statement[] | null {
  const head = sts[0]; const j = sts.findIndex((t) => !!t.speaker && samePerson(t.speaker, x));
  if (j === 0) return null;
  const mine = j > 0 ? sts[j]! : statementOf(x, ''); const rest = sts.filter((_, q) => q !== j);
  if (!head?.speaker) return [{ ...mine, quote: head?.quote.trim() ? head.quote : mine.quote }, ...rest.slice(1)];
  return j < 0 && sts.length >= POINT_LIMITS.statements ? null : [mine, ...rest];
}
function stepsFor(p: Point, org: number): Step[] {
  const s: Step[] = [];
  if (!p.akceId) s.push({ key: 'zaklad', title: 'O čem je zpráva' });
  s.push({ key: 'org', title: 'Kdo to organizoval' }, { key: 'co', title: 'Jak to dopadlo' });
  p.content.bullets.forEach((b, i) => { if (i !== org && b.kind === 'people' && b.key !== 'organisers' && b.key !== 'speakers') s.push({ key: `lide-${i}`, title: b.label }); if (b.kind === 'text') s.push({ key: `text-${i}`, title: b.label }); });
  const sts = Math.max(1, p.content.statements.length);
  for (let i = 0; i < sts; i++) s.push({ key: i ? `kdo-${i}` : 'kdo', title: 'Kdo se vyjádřil' }, { key: i ? `rekl-${i}` : 'rekl', title: 'Co řekl' });
  s.push({ key: 'hotovo', title: 'Kontrola' });
  return s;
}
function Dots({ n, of }: { n: number; of: number }) { return <div className="steps" role="img" aria-label={`Krok ${n} z ${of}`}>{Array.from({ length: of }, (_, k) => <span key={k} className={k < n ? 'on' : ''} />)}</div>; }

const peopleAdded = (added: number, present: number) => (added ? `Přidali jsme ${Q.counts(added, 'člověka', 'lidi', 'lidí')}.` : present ? 'Všichni ze souboru už v seznamu jsou.' : 'Nikoho jsme nepřidali.') + (added && present ? ` ${present === 1 ? 'Jeden už v seznamu byl' : `${present} už v seznamu ${present <= 4 ? 'byli' : 'bylo'}`}.` : '');
/** With `room` (how many people the row may still take), the list can also come from a spreadsheet (ADR 0077). */
function PeoplePick({ list, onAdd, placeholder, autoFocus, room }: { list: DraftPerson[]; onAdd: (p: DraftPerson[]) => void; placeholder: string; autoFocus?: boolean; room?: number }) {
  const { s } = useStore(); const [v, set] = useState(''); const me = Q.me(s)!;
  const latest = useRef({ list, onAdd, room: room ?? 0 }); useEffect(() => { latest.current = { list, onAdd, room: room ?? 0 }; });
  const year = Q.yearOf(s);
  const known = useMemo(() => {
    const r = Q.peopleFor(s, me.id).map((x) => ({ ...x, how: 'uvedli jste v dřívější zprávě' }));
    const recent = new Map(r.map((x) => [foldForSearch(`${x.givenName} ${x.familyName}`), x]));
    // Staff who write points copy a colleague's address as it is now; the class or job comes from the directory row, else from an earlier report.
    const dir = s.cards.map((c) => ({ ...directoryPerson(s, c, recent.get(foldForSearch(`${c.givenName} ${c.familyName}`))), how: 'ze školního adresáře' }));
    const seen = new Set<string>();
    return [...dir, ...r].filter((x) => { const k = foldForSearch(`${x.givenName} ${x.familyName}`); if (seen.has(k) || list.some((l) => foldForSearch(displayName(l)) === k)) return false; seen.add(k); return true; });
  }, [s, me.id, list]);
  const f = foldForSearch(v.trim());
  const hits = f && !/[,;\n]/.test(v) ? known.filter((x) => foldForSearch(`${x.givenName} ${x.familyName}`).includes(f)).slice(0, 4) : [];
  const parsed = v.trim() ? parsePeopleList(Q.oneOnLine(v), known) : null;
  /** The reader loads on first use; the people are added to the list as it is when the file has been read. */
  const readFile = async (f: File): Promise<Said> => {
    const [{ readPeople }, { addPeople, toDraftPeople }] = await Promise.all([loadChunk(() => import('../core/import/participants')), loadChunk(() => import('../core/import/draft-people'))]);
    const sheet = await readPeople(f, new DOMParser());
    if (!sheet.length) return { err: true, t: NO_NAMES };
    const d = toDraftPeople(sheet, known, year); const now = latest.current;
    const r = addPeople(now.list, d.people, now.room);
    if ('tooMany' in r) return { err: true, t: tooManyPeople(r.tooMany, now.room) };
    if (r.people.length) now.onAdd(r.people);
    const not = d.rejected.length ? ` Bez příjmení nebo s příliš dlouhým jménem jsme nepřidali: ${d.rejected.join(', ')}.` : '';
    return { err: !r.people.length && !r.present, t: peopleAdded(r.people.length, r.present) + not };
  };
  const addParsed = () => { if (!parsed || !parsed.rows.length) return; onAdd(parsed.rows.map((r) => ({ salutation: null, givenName: r.givenName, familyName: r.familyName, ...(r.affiliation && { affiliation: normalizeClass(r.affiliation) ?? r.affiliation, affiliationYear: year }) }))); set(''); };
  return <div className="stack st8">
    <label className="l"><span className="vh">Jména</span><textarea className="in bigi" rows={1} value={v} autoFocus={autoFocus} placeholder={placeholder} onBlur={() => { if (!hits.length && parsed?.rows.length && !parsed.rejected.length) addParsed(); }} onChange={(e) => set(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (hits.length === 1) { onAdd([draftPersonOf(hits[0]!)]); set(''); } else addParsed(); } }} /></label>
    {hits.length ? <div className="picks">{hits.map((h) => { const { how } = h; return <button type="button" className="pick" key={`${h.givenName}${h.familyName}`} onClick={() => { onAdd([draftPersonOf(h)]); set(''); }}><b>{h.givenName} {h.familyName}</b><span>{h.affiliation ? `${h.affiliation}, ` : ''}{how}</span></button>; })}</div> : null}
    {parsed?.rows.length ? <button type="button" className="btn lg w" onClick={addParsed}>{parsed.rows.length === 1 ? `Přidat: ${parsed.rows[0]!.givenName} ${parsed.rows[0]!.familyName}${parsed.rows[0]!.affiliation ? ` (${parsed.rows[0]!.affiliation})` : ''}` : `Přidat ${parsed.rows.length} ${parsed.rows.length < 5 ? 'lidi' : 'lidí'}`}</button> : null}
    {parsed?.rejected.length ? <p className="sm w-err" role="alert">Nerozumíme: {parsed.rejected.map((r) => r.source).join(', ')}. Chybí příjmení.</p> : null}
    {room === undefined ? null : <SheetPicker read={readFile} hint={PEOPLE_SHEET_HINT} />}
  </div>;
}
/** The Účastníci row's one label for everybody, one of three (ADR 0071, 0074); what is missing or does not fit shows in the dock hint, as for every step. */
function AddressChoice({ value, onChange }: { value: ReportAddress | null | undefined; onChange: (v: ReportAddress) => void }) {
  return <div className="stack st6"><span className="lb">Oslovení účastníků</span><Seg label="Oslovení účastníků" value={value ?? null} options={REPORT_ADDRESS_OPTIONS} onChange={onChange} /></div>;
}
/** The Účastníci row names its people without a salutation each (`bare`): the one label above them speaks for all. */
function PersonRow({ p, bare, onChange, onRemove }: { p: DraftPerson; bare?: boolean; onChange: (p: DraftPerson) => void; onRemove: () => void }) {
  const { s } = useStore(); const year = Q.yearOf(s);
  return <li className="pr"><div className="pr-h"><b>{displayName(p)}</b><input className="in cls" aria-label={`Třída nebo organizace: ${displayName(p)}`} placeholder="Třída" value={p.affiliation ?? ''} onChange={(e) => onChange({ ...p, affiliation: e.target.value, affiliationYear: year })} onBlur={(e) => { const c = normalizeClass(e.target.value); if (c) onChange({ ...p, affiliation: c, affiliationYear: year }); }} /><button type="button" className="x" aria-label={`Odebrat: ${displayName(p)}`} onClick={onRemove}><Ic n="x" /></button></div>
    {p.head && p.salutation ? <p className="sm">Vyjde: {headedName({ salutation: p.salutation, head: p.head, ...(p.complement && { complement: p.complement }) }, displayName(p))}<button type="button" className="q in-l" aria-label={`Bez funkce: ${displayName(p)}`} onClick={() => onChange(Q.withoutFunction(p))}>Bez funkce</button></p> : null}
    {bare ? null : <Seg label={`Oslovení: ${displayName(p)}`} value={p.salutation} options={SAL} onChange={(v) => onChange({ ...p, salutation: v })} />}</li>;
}
export function Wizard({ id, step }: { id: string; step?: string }) {
  const { s, apply } = useStore(); const p = s.points.find((x) => x.id === id);
  const curRef = useRef<HTMLDivElement | null>(null); const [del, setDel] = useState(false);
  useEffect(() => { curRef.current?.querySelector('.cur')?.scrollIntoView({ block: 'center', behavior: 'smooth' }); });
  if (!p) return <NotFound />;
  if (p.authorId !== s.userId) return <NotFound />;
  if (p.state !== 'draft' && p.state !== 'returned') { if (location.hash.includes('/psat/')) goReplace(`/zprava/${id}`); return null; }
  const org = organiserAt(p.content); const steps = stepsFor(p, org); const key = step && steps.some((x) => x.key === step) ? step : steps[p.akceId ? 0 : 0]!.key;
  const k = steps.findIndex((x) => x.key === key); const cur = steps[k]!;
  const next = steps[k + 1]?.key, prev = steps[k - 1]?.key;
  const c = p.content; const set = (patch: Partial<PointContent>) => apply(A.savePoint(id, { ...c, ...patch }));
  const toStep = (x?: string) => go(x ? `/psat/${id}/${x}` : '/');
  const owed = p.akceId ? Q.owedBy(s, s.userId).find((o) => o.akce.id === p.akceId) : null;
  const target = p.akceId ? Q.owedMonday(s, s.futures.find((f) => f.id === p.akceId)!) : Q.toIsoDate(Q.handInTo(s).monday);
  const m = Q.issueOf(s, target) ? target : Q.workingMonday(s);
  const built = Q.buildDoc(s, m, { draft: { ...p, poradaMonday: m } });
  const sheet = focusOn(built, id);
  const si = Number(/^(?:kdo|rekl)-(\d+)$/.exec(cur.key)?.[1] ?? 0); const sfx = si ? `-${si}` : '';
  const st0 = c.statements[si];
  const putSt = (x: PointContent['statements'][number]) => { const a = [...c.statements]; a[si] = x; set({ statements: a }); };
  const speakerName = st0?.speaker ? displayName(st0.speaker) : '';
  const meP = Q.mePerson(s); const orgBul = org >= 0 ? (c.bullets[org] as Extract<DraftBullet, { kind: 'people' }>) : null; const orgPeople = orgBul?.people ?? [];
  const isOrg = (x: DraftPerson) => orgPeople.some((o) => samePerson(o, x));
  const setOrg = (people: readonly DraftPerson[]) => set({ bullets: orgBul ? c.bullets.map((b, j) => (j === org ? { ...orgBul, people } : b)) : [...c.bullets, { key: 'organisers', label: 'Organizátoři', kind: 'people', order: 'input', people }] });
  /** Leaving „Kdo to organizoval“: a lone organiser is the one who speaks first, and a statement already written moves after theirs. */
  const leadFromOrg = () => {
    const lead = c.statements[0]; const only = orgPeople[0];
    if (orgPeople.length !== 1 || !only || (lead?.speaker && isOrg(lead.speaker))) return;
    const next = leadBy(c.statements, only); if (next) set({ statements: next });
  };
  const lead = c.statements[0]; const leadOk = !!lead?.speaker && isOrg(lead.speaker) && !!lead.quote.trim();
  let ask: ReactNode = '', help: ReactNode = '', body: ReactNode = null, can = true, hint = '', nextText = 'Pokračovat';
  const body0 = toText(c.body);
  const banner = owed?.late ? <Note h={`Odevzdejte do ${Q.fromDay(WHEN(owed.close))}`}>Akce skončila až po uzávěrce, proto má zpráva vlastní čas. Vyjde v poradě {Q.dm(owed.monday)}</Note> : owed?.pastClose ? <Note h="Termín už minul">Porada {Q.dm(owed.monday)} na zprávu ještě čeká, takže se stihne.</Note> : !p.akceId && Q.toIsoDate(Q.handInTo(s).monday) !== Q.workingMonday(s) ? <Note h={`Půjde na poradu ${Q.dm(Q.handInTo(s).meetingDate)}`}>Uzávěrka porady {Q.dm(Q.working(s).meetingDate)} už minula.</Note> : null;
  if (cur.key === 'zaklad') {
    ask = 'O čem bude zpráva?'; help = 'Vyplňte základ a úvodní větu napíšeme za Vás.';
    const jinde = (c.campus ?? 'jinde') === 'jinde'; const place = c.place ?? '';
    const notOver = !!c.eventDate && compareDates(c.eventDate, Q.todayOf(s)) > 0;
    can = !!c.title.trim() && !!c.eventDate && !notOver && (!jinde || !!place.trim()); hint = !c.title.trim() || !c.eventDate ? 'Napište název a datum.' : notOver ? copy.readiness.problem('event-not-over', {}) : 'Napište, kde to bylo.';
    body = <div className="stack">
      <label className="l">Jak se to jmenovalo<TitleField autoFocus value={c.title} onChange={(v) => set({ title: v })} placeholder="Například: Robotiáda" /></label>
      <div className="two"><label className="l">Kdy<input className="in bigi" type="date" max={toIsoDate(Q.todayOf(s))} value={c.eventDate ? toIsoDate(c.eventDate) : ''} onChange={(e) => set({ eventDate: e.target.value ? parseIsoDate(e.target.value) : null })} /></label><label className="l">Kde<select className="in bigi" value={c.campus ?? 'jinde'} onChange={(e) => set({ campus: e.target.value as PointContent['campus'] })}><option value="smichov">Smíchov</option><option value="radlice">Radlice</option><option value="na-vidouli">Na Vidouli</option><option value="jinde">Jinde</option></select></label></div>
      <label className="l">{jinde ? 'Kde přesně' : 'Kde přesně (nepovinné)'}<small>{jinde ? 'Například Národní muzeum nebo na Pražském hradě.' : 'Třeba číslo učebny, například S206.'}</small><input className="in bigi" maxLength={POINT_LIMITS.place} autoCapitalize="none" value={place} placeholder={jinde ? 'Například: Národní muzeum' : 'Například: S206'} onChange={(e) => set({ place: e.target.value || null })} />{placeLine(place)}</label>
    </div>;
  } else if (cur.key === 'org') {
    const noSal = orgPeople.filter((x) => !x.salutation).length;
    ask = orgBul?.key === 'speakers' ? 'Kdo přednášel?' : 'Kdo to organizoval?'; help = 'Většinou to jste Vy. Když to organizoval někdo jiný nebo víc lidí, přidejte je. Jeden z nich se pak ke zprávě vyjádří.';
    can = orgPeople.length > 0 && noSal === 0; hint = orgPeople.length ? `U ${noSal === 1 ? 'jednoho člověka' : `${noSal} lidí`} ještě vyberte oslovení.` : 'Přidejte aspoň jednoho člověka.';
    body = <>{!orgPeople.some((x) => samePerson(x, meP)) ? <button type="button" className="btn lg w" onClick={() => setOrg([meP, ...orgPeople])}><Ic n="plus" />Přidat sebe: {displayName(meP)}</button> : null}<PeoplePick list={[...orgPeople]} placeholder="Někdo jiný? Začněte psát jméno" onAdd={(x) => setOrg([...orgPeople, ...x])} />{orgPeople.length ? <ul className="prs">{orgPeople.map((x, j) => <PersonRow key={j} p={x} onChange={(n) => setOrg(orgPeople.map((y, q) => (q === j ? n : y)))} onRemove={() => setOrg(orgPeople.filter((_, q) => q !== j))} />)}</ul> : null}</>;
  } else if (cur.key === 'co') {
    ask = 'Jak to dopadlo?'; help = 'Stačí pár vět. Úvodní větu o tom, kdy a kde akce byla, jsme napsali za Vás.';
    can = !!body0.trim(); hint = 'Napište aspoň jednu větu.';
    body = <><label className="l"><span className="vh">Jak to dopadlo</span><textarea className="in big" autoFocus value={body0} onChange={(e) => set({ body: fromText(e.target.value) })} placeholder="Například: Tým ze 3.B postoupil do celostátního kola." /></label>
      <details className="op"><summary>Upravit úvodní větu</summary><label className="l"><span className="vh">Úvodní věta</span><textarea className="in" value={c.opening} onChange={(e) => set({ opening: e.target.value, openingEdited: true })} /></label>{c.openingEdited ? <button type="button" className="q" onClick={() => apply(A.savePoint(id, { ...c, openingEdited: false }))}>Vrátit větu podle údajů o akci</button> : null}</details></>;
  } else if (cur.key.startsWith('lide-')) {
    const i = Number(cur.key.split('-')[1]); const bul = c.bullets[i] as Extract<DraftBullet, { kind: 'people' }>;
    const req = REPORT_BULLETS.find((b) => b.key === bul.key)?.required ?? false;
    const setPeople = (people: readonly DraftPerson[]) => set({ bullets: c.bullets.map((b, j) => (j === i ? { ...bul, people } : b)) });
    const grouped = bul.key === PARTICIPANTS_KEY; const bare = grouped;
    const noSal = bare ? 0 : bul.people.filter((x) => !x.salutation).length;
    const addr = grouped ? Q.readiness(s, p).problems.find((x) => x.path === `content.bullets.${i}.address`) : undefined;
    const setAddress = (address: ReportAddress) => set({ bullets: c.bullets.map((b, j) => (j === i ? { ...bul, address } : b)) });
    ask = bul.key === 'participants' ? 'Kdo se účastnil?' : `${bul.label}?`; help = 'Napište jména, nebo vložte seznam třeba z Excelu. Třídu napište do závorky, například Tereza Malá (3.B).';
    can = (bul.people.length > 0 || !req) && noSal === 0 && !addr; hint = bul.people.length === 0 && req ? 'Přidejte aspoň jednoho člověka.' : addr ? copy.readiness.problem(addr.code, addr.params) : noSal ? `U ${noSal === 1 ? 'jednoho člověka' : `${noSal} lidí`} ještě vyberte oslovení. Nehádáme ho za Vás.` : '';
    nextText = bul.people.length === 0 && !req ? 'Přeskočit' : 'Pokračovat';
    body = <>{noSal > 1 ? <button type="button" className="btn lg w" onClick={() => setPeople(bul.people.map((x) => (x.salutation ? x : { ...x, salutation: Q.guessSalutation(x) })))}>Doplnit oslovení podle jmen</button> : null}{noSal > 1 ? <p className="sm">Je to jen odhad, po doplnění je prosím zkontrolujte.</p> : null}<PeoplePick list={[...bul.people]} autoFocus room={grouped ? Math.min(POINT_LIMITS.peoplePerBullet - bul.people.length, POINT_LIMITS.peoplePerPoint - c.bullets.reduce((n, b) => n + (b.kind === 'people' ? b.people.length : 0), 0)) : undefined} placeholder="Například: Tereza Malá (3.B), Jakub Veselý (3.B)" onAdd={(x) => setPeople([...bul.people, ...(grouped ? x.map(Q.unaddressed) : x)])} />{grouped && bul.people.length ? <AddressChoice value={bul.address} onChange={setAddress} /> : null}{bul.people.length ? <ul className="prs">{bul.people.map((x, j) => <PersonRow key={j} p={x} bare={bare} onChange={(n) => setPeople(bul.people.map((y, q) => (q === j ? n : y)))} onRemove={() => setPeople(bul.people.filter((_, q) => q !== j))} />)}</ul> : null}</>;
  } else if (cur.key.startsWith('text-')) {
    const i = Number(cur.key.split('-')[1]); const bul = c.bullets[i] as Extract<DraftBullet, { kind: 'text' }>;
    ask = `${bul.label}?`; help = 'Nepovinné. Když není co psát, klidně přeskočte.'; nextText = bul.text.trim() ? 'Pokračovat' : 'Přeskočit';
    body = <label className="l"><span className="vh">{bul.label}</span><textarea className="in big" autoFocus value={bul.text} onChange={(e) => set({ bullets: c.bullets.map((b, j) => (j === i ? { ...bul, text: e.target.value } : b)) })} /></label>;
  } else if (cur.key.startsWith('kdo')) {
    ask = si ? 'Kdo další se vyjádřil?' : 'Kdo z organizátorů se vyjádří?'; help = si ? 'Nepovinné, třeba někdo z účastníků. Vyberte ho, co řekl, napíšete v dalším kroku.' : 'Každá zpráva má vyjádření organizátora. Vyberte ho, co řekl, napíšete v dalším kroku. Vyjádření účastníků můžete přidat potom.';
    const inBullets = (si ? c.bullets.flatMap((b) => (b.kind === 'people' ? b.people : [])) : orgPeople).filter((x) => x.familyName);
    const others = c.statements.flatMap((x, j) => (j !== si && x.speaker ? [x.speaker] : []));
    const uniq = inBullets.filter((x, i, a) => a.findIndex((y) => samePerson(y, x)) === i && (!si || !others.some((o) => samePerson(o, x))));
    const pick = (x: DraftPerson) => putSt(statementOf(x, st0?.quote ?? ''));
    const choose = (x: DraftPerson) => (si ? pick(x) : set({ statements: leadBy(c.statements, x) ?? c.statements }));
    /** „Změnit“ on a first statement by someone who did not organise keeps their words as a later statement. */
    const blank: Statement = { speaker: null, speakerGenitive: '', quote: '' };
    const change = () => (!si && st0?.speaker && !isOrg(st0.speaker) && c.statements.length < POINT_LIMITS.statements ? set({ statements: [blank, ...c.statements] }) : putSt({ ...blank, quote: st0?.quote ?? '' }));
    const notOrg = !si && !!st0?.speaker && !isOrg(st0.speaker);
    can = !!st0?.speaker && !!st0.speakerGenitive.trim() && !!st0.speaker.salutation && !notOrg; hint = notOrg ? 'Vyjádřit se má někdo z organizátorů.' : st0?.speaker ? 'Zkontrolujte tvar jména.' : 'Vyberte člověka.';
    const g = st0?.speaker ? Q.genitiveFor(st0.speaker) : null;
    const dropThis = si ? <button type="button" className="q r" onClick={() => { set({ statements: c.statements.filter((_, q) => q !== si) }); toStep('hotovo'); }}>Další vyjádření nepřidávat</button> : null;
    body = st0?.speaker ? <div className="stack st8">
      <div className="pick pick-r"><span className="tx"><b>{speakerName}</b>{st0.speaker.affiliation ? <span>{st0.speaker.affiliation}</span> : null}</span><button type="button" className="btn" onClick={change}>Změnit</button></div>
      {notOrg ? <Note err>{speakerName} není mezi organizátory. Vyberte někoho z nich, nebo ho doplňte do organizátorů.</Note> : null}
      {!st0.speaker.salutation ? <div className="stack st6"><span className="lb">Oslovení</span><Seg label="Oslovení" value={null} options={SAL} onChange={(v) => { const sp = { ...st0.speaker!, salutation: v }; pick(sp); }} /></div> : null}
      {st0.speaker.salutation ? <label className="l">Do dokumentu patří „vyjádření koho“{g?.needsCheck ? <small>Tvar jsme jen odhadli, prosím zkontrolujte ho.</small> : <small>Tvar jsme doplnili, opravte ho, jen když nesedí.</small>}<input className={`in bigi${g?.needsCheck ? ' chk-it' : ''}`} value={st0.speakerGenitive} onChange={(e) => putSt({ ...st0, speakerGenitive: e.target.value })} /></label> : null}
    </div> : <>{uniq.length ? <div className="picks">{uniq.map((x) => <button type="button" className="pick" key={displayName(x)} onClick={() => choose(x)}><b>{displayName(x)}</b><span>{x.affiliation ? `${x.affiliation}, ` : ''}{si ? 'je ve Vaší zprávě' : 'organizátor'}</span></button>)}</div> : null}{si ? <PeoplePick list={uniq} placeholder="Někdo jiný? Začněte psát jméno" onAdd={(x) => choose(x[0]!)} /> : <p className="sm">Chybí tu někdo? <a href={Hash(`/psat/${id}/org`)}>Doplňte organizátory</a></p>}{dropThis}</>;
  } else if (cur.key.startsWith('rekl')) {
    ask = st0?.speaker ? (samePerson(st0.speaker, meP) ? 'Co k tomu říkáte?' : `Co ${speakerName} řekl${st0.speaker.salutation === 'pan' ? '' : 'a'}?`) : 'Co řekl?'; help = 'Může to být jedna věta i celý odstavec. V dokumentu vyjde jako jeden odstavec v uvozovkách, ty doplníme.';
    can = !!st0?.quote.trim(); hint = 'Napište, co řekl nebo řekla.';
    if (!st0?.speaker) { body = <Note>Nejdřív vyberte, kdo se vyjádřil. <a href={Hash(`/psat/${id}/kdo${sfx}`)}>Vybrat</a></Note>; can = false; }
    else body = <><label className="l"><span className="vh">Co řekl</span><textarea className="in big" autoFocus maxLength={POINT_LIMITS.quote} value={st0.quote} onChange={(e) => putSt({ ...st0, quote: e.target.value })} placeholder="Například: Robota jsme ladili až do poslední minuty." /></label>
      {POINT_LIMITS.quote - st0.quote.length < 300 ? <p className="sm" role="status">{Q.charsLeft(POINT_LIMITS.quote - st0.quote.length)}</p> : null}
      {can && c.statements.length < POINT_LIMITS.statements && si === c.statements.length - 1 ? <button type="button" className="btn lg w" onClick={() => { set({ statements: [...c.statements, { speaker: null, speakerGenitive: '', quote: '' }] }); go(`/psat/${id}/kdo-${c.statements.length}`); }}><Ic n="plus" />Přidat další vyjádření</button> : null}</>;
  } else {
    const r = Q.readiness(s, p); const try_ = A.trySubmit(s, id);
    ask = 'Takhle to vyjde. Můžeme to poslat?'; help = 'Vedení si to přečte a když bude něco chybět, ozve se Vám. Do té doby to můžete vzít zpět.';
    can = try_.ok && leadOk; nextText = Q.me(s)?.role === 'headmaster' ? 'Zařadit do porady' : 'Odeslat vedení';
    const ans = (t: string, v: ReactNode, to: string) => <div className="ans" key={`${t}${to}`}><span className="tx"><span className="st">{t}</span><span className="tt">{v}</span></span><a className="btn" href={Hash(`/psat/${id}/${to}`)} aria-label={`Změnit: ${t}`}>Změnit</a></div>;
    body = <>
      {r.problems.length ? <Note err h="Ještě chybí">{r.problems.map((x, i) => <span key={i} className="pl">{copy.readiness.problem(x.code, x.params)}</span>)}</Note> : null}
      {!(lead?.speaker && isOrg(lead.speaker)) ? <Note err h="Chybí vyjádření organizátora">Zpráva potřebuje vyjádření někoho z organizátorů. <a href={Hash(`/psat/${id}/kdo`)}>Doplnit</a></Note> : null}
      {!try_.ok && try_.why === 'report-not-due' ? <Note err h="Porada už je vygenerovaná">Zprávu už nejde odeslat.</Note> : null}
      <div className="anss">
        {ans(orgBul?.label ?? 'Organizátoři', orgPeople.map(displayName).join(', ') || 'Nikdo', 'org')}
        {ans('Jak to dopadlo', body0 || 'Zatím nic', 'co')}
        {c.bullets.map((b, i) => (b.kind === 'people' && i !== org ? ans(b.label, [b.key === PARTICIPANTS_KEY && b.address ? participantsLabel(b.address, b.people.length > 1) : null, b.people.map(displayName).join(', ')].filter(Boolean).join(' ') || 'Nikdo', `lide-${i}`) : b.kind === 'text' ? ans(b.label, b.text || 'Nevyplněno', `text-${i}`) : null))}
        {(c.statements.length ? c.statements : [null]).map((x, j) => ans(!j ? 'Vyjádření organizátora' : c.statements.length > 2 ? `Další vyjádření ${j}` : 'Další vyjádření', x?.speaker ? <>{displayName(x.speaker)}: „{x.quote}“{j ? <> <button type="button" className="q in-l r" onClick={() => set({ statements: c.statements.filter((_, q) => q !== j) })}>Odebrat</button></> : null}</> : 'Nikdo', j ? `kdo-${j}` : 'kdo'))}
      </div>
      {r.warnings.length ? <p className="sm">{copy.readiness.warning(r.warnings[0]!.code, r.warnings[0]!.params)}</p> : null}
    </>;
  }
  const n = k + 1; const of = steps.length;
  return <App nar noNav
    over={del ? <Dialog title={p.state === 'returned' ? 'Smazat vrácenou zprávu?' : 'Smazat rozepsanou zprávu?'} onClose={() => setDel(false)}><p>Smaže se i všechno, co jste napsali, a vrátit to nepůjde.{Q.asksAgain(s, p) ? ' O zprávu z akce Vás znovu požádáme.' : ''}</p><div className="row"><button type="button" className="btn lg" onClick={() => setDel(false)}>Nechat</button><button type="button" className="btn dk lg" onClick={() => { apply(A.withdrawPoint(id)); goReplace('/'); }}>Smazat</button></div></Dialog> : null}
    col={<>
      <div className="wzh"><a className="q" href="#/">Odejít, rozepsané zůstane uložené</a><button type="button" className="q r" onClick={() => setDel(true)}>Smazat zprávu</button></div>
      <p className="stn">{c.title || 'Nová zpráva'}, <span className="nbr">krok {n} z {of}</span></p><Dots n={n} of={of} />
      {banner}
      <div className="top"><h1 className="ask">{ask}</h1>{help ? <p className="lead">{help}</p> : null}</div>
      {body}
      <div className="pv" aria-label="Takhle to vyjde v dokumentu"><p className="pvh">Takhle to vyjde</p><Sheet built={{ ...sheet, segments: sheet.segments.filter((x) => x.key === id) }} empty={null} /></div>
    </>}
    dock={<div className="dock">{!can && hint ? <p className="hint a" id="wz-hint">{hint}</p> : null}<div className="row wzb"><button type="button" className="btn lg" onClick={() => { if (si && cur.key.startsWith('kdo') && !st0?.speaker) set({ statements: c.statements.filter((_, q) => q !== si) }); toStep(prev); }}><Ic n="back" />Zpět</button><button type="button" className={`btn lg ${can ? 'go' : 'off'}`} aria-disabled={!can} {...(!can && hint ? { 'aria-describedby': 'wz-hint' } : {})} onClick={() => { if (!can) return; if (cur.key === 'hotovo') { apply(A.submitPoint(id)); if (Q.me(s)?.role === 'headmaster') apply(A.approvePoint(id)); goReplace(`/zprava/${id}?fresh=1`); } else { if (cur.key === 'org') leadFromOrg(); toStep(next); } }}>{nextText}</button></div><Saved /></div>}
    desk={<Desk cls="tall wzd" note={<b>Takhle to vyjde v dokumentu</b>}><div className="wrapm wrapn" ref={curRef}><Sheet built={sheet} cls={(x) => (x.key === id ? 'cur live' : '')} empty={<div className="arch"><p className="center">Dokument se objeví, až vyplníte název a datum.</p></div>} /></div></Desk>} />;
}
/** What a return without parts (one from before ADR 0058) opens: the text and the statements. */
const NOTE_ONLY = ['body', 'statements'];
/** A returned report: the parts the reviewer named (ADR 0058), then send again. */
export function Oprava({ id }: { id: string }) {
  const { s, apply } = useStore(); const p = s.points.find((x) => x.id === id); const [more, setMore] = useState(false);
  if (!p || p.authorId !== s.userId) return <NotFound />;
  const last = p.trail.filter((t) => t.what.startsWith('Vráceno')).at(-1);
  const name = Q.nameOf(Q.userById(s, last?.who ?? ''));
  const c = p.content; const sts = c.statements; const org = organiserAt(p.content);
  // A named part with nothing to show here (a people list, when the organisers are the only one) opens none.
  const shown = (p.parts ?? []).filter((x) => x !== 'people' || c.bullets.some((b, i) => b.kind === 'people' && i !== org));
  const open = shown.length ? shown : NOTE_ONLY;
  const set = (patch: Partial<PointContent>) => apply(A.savePoint(id, { ...c, ...patch }));
  const setPeople = (i: number, people: readonly DraftPerson[]) => set({ bullets: c.bullets.map((b, j) => (j === i && b.kind === 'people' ? { ...b, people } : b)) });
  const setAddress = (i: number, address: ReportAddress) => set({ bullets: c.bullets.map((b, j) => (j === i && b.kind === 'people' ? { ...b, address } : b)) });
  const m = p.poradaMonday ?? Q.workingMonday(s);
  const built = focusOn(Q.buildDoc(s, m, { draft: p }), id);
  const can = A.trySubmit(s, id).ok; const problems = Q.readiness(s, p).problems; const problem = problems[0];
  return <App nar noNav col={<>
    <div className="wzh"><a className="q" href="#/">Odejít, rozepsané zůstane uložené</a></div>
    <p className="stn">{c.title}</p>
    <div className="top"><h1 className="ask">{name || 'Vedení'} prosí o úpravu</h1></div>
    <Rework labels={Q.partLabels(p, p.parts)} note={p.note} />
    {open.includes('heading') ? <div className="stack"><label className="l">Název<TitleField value={c.title} onChange={(v) => set({ title: v })} /></label>{p.kind === 'report' ? <label className="l">Kdy<input className="in bigi" type="date" max={toIsoDate(Q.todayOf(s))} value={c.eventDate ? toIsoDate(c.eventDate) : ''} onChange={(e) => set({ eventDate: e.target.value ? parseIsoDate(e.target.value) : null })} /></label> : null}</div> : null}
    {open.includes('body') ? <label className="l">Text zprávy<textarea className="in big" value={toText(c.body)} onChange={(e) => set({ body: fromText(e.target.value) })} /></label> : null}
    {c.bullets.map((b, i) => (b.kind === 'people' && i !== org && (open.includes('people') || problems.some((x) => x.path === `content.bullets.${i}.address`)) ? <div className="stack st8" key={b.key}><span className="lb">{b.label}</span><PeoplePick list={[...b.people]} placeholder="Například: Tereza Malá (3.B), Jakub Veselý (3.B)" onAdd={(x) => setPeople(i, [...b.people, ...x])} />{b.key === PARTICIPANTS_KEY && b.people.length ? <AddressChoice value={b.address} onChange={(v) => setAddress(i, v)} /> : null}{b.people.length ? <ul className="prs">{b.people.map((x, j) => <PersonRow key={j} p={x} bare={b.key === PARTICIPANTS_KEY} onChange={(n) => setPeople(i, b.people.map((y, q) => (q === j ? n : y)))} onRemove={() => setPeople(i, b.people.filter((_, q) => q !== j))} />)}</ul> : null}</div> : null))}
    {open.includes('statements') ? <div className="stack st8">{sts.length > 1 ? <span className="lb">Vyjádření</span> : null}{sts.map((x, i) => <div className="stmt" key={i}><label className="l">{x.speakerGenitive ? `Vyjádření ${x.speakerGenitive}` : 'Kdo'}<textarea className="in big" maxLength={POINT_LIMITS.quote} value={x.quote} onChange={(e) => set({ statements: sts.map((y, j) => (j === i ? { ...y, quote: e.target.value } : y)) })} /></label></div>)}
      {more ? <div className="stmt"><label className="l">Kdo (ve tvaru „koho“)<input className="in" autoFocus placeholder="ředitele školy" onBlur={(e) => { if (e.target.value.trim()) { set({ statements: [...sts, { speaker: { salutation: 'pan', givenName: '', familyName: e.target.value.trim() }, speakerGenitive: e.target.value.trim(), quote: '' }] }); setMore(false); } }} /></label></div> : <button type="button" className="q" onClick={() => setMore(true)}>Přidat další vyjádření</button>}
    </div> : null}
    <a className="q" href={Hash(`/psat/${id}/hotovo`)}>Upravit ostatní části zprávy</a>
    <div className="pv"><p className="pvh">Takhle to vyjde</p><Sheet built={{ ...built, segments: built.segments.filter((x) => x.key === id) }} /></div>
  </>} dock={<div className="dock">{!can ? <p className="hint a">{problem ? copy.readiness.problem(problem.code, problem.params) : 'Zprávu teď nejde poslat.'}</p> : null}<div className="row wzb"><a className="btn lg" href="#/"><Ic n="back" />Zpět</a><button type="button" className={`btn lg ${can ? 'go' : 'off'}`} aria-disabled={!can} onClick={() => { if (!can) return; apply(A.submitPoint(id)); goReplace(`/zprava/${id}?fresh=1`); }}>Poslat znovu</button></div><Saved /></div>}
    desk={<Desk cls="tall wzd" note={<b>Takhle to vyjde v dokumentu</b>}><div className="wrapm wrapn"><Sheet built={built} cls={(x) => (x.key === id ? 'cur live' : '')} /></div></Desk>} />;
}
