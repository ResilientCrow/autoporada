import { isAadstsCode, isFailureCause, isSignInError } from '@/contracts';
import { foldForSearch, normalizeClass } from '@/domain/cs';
import { failures } from '@/ui/copy/failures';
import { signIn } from '@/ui/copy/sign-in';
import { useState } from 'react';
import { isClassCode, parsePaste, type PasteRow } from '@/domain/registry';
import { go, useStore } from '../core/react';
import * as Q from '../core/select';
import * as A from '../core/ops';
import { App, Back, Bar, Desk, Dialog, Ic, Item, Note, PhoneBar, Sec, Seg, Toast, Top, WHEN } from './ui';
import { NotFound } from './home';
import logo from './logo-dark.svg';

const Tabs = ({ on }: { on: string }) => { const { s } = useStore(); return <div className="tabs sgm" role="navigation" aria-label="Správa">{[['/lide', `Lidé${Q.pendingRequests(s).length ? ` (${Q.pendingRequests(s).length})` : ''}`], ['/seznamy', 'Seznamy studentů'], ['/typy', 'Typy zpráv'], ['/nastaveni', 'Nastavení']].map(([to, t]) => <a key={to} className={on === to ? 'on' : ''} href={`#${to}`}>{t}</a>)}</div>; };
function Pane({ on, children }: { on: string; children: React.ReactNode }) { const { s } = useStore(); return Q.me(s)?.role === 'headmaster' ? <div className="work solo"><Bar /><main className="pane"><Tabs on={on} />{children}</main><PhoneBar /></div> : <NotFound />; }
const ROLE = { pending: 'Bez přístupu', submitter: 'Píše zprávy', reviewer: 'Vedení', headmaster: 'Ředitel' } as const;
export function Lide() {
  const { s, apply } = useStore(); const [q, setQ] = useState(''); const [dlg, setDlg] = useState<string | null>(null);
  const f = q.toLowerCase(); const us = s.users.filter((u) => !f || Q.nameOf(u).toLowerCase().includes(f) || u.email.includes(f));
  const req = Q.pendingRequests(s); const r = s.requests.find((x) => x.id === dlg);
  return <Pane on="/lide"><Top h="Lidé" />
    {r ? <Dialog title={`Co s žádostí: ${r.name}?`} onClose={() => setDlg(null)}><div className="stack st8"><button className="btn go lg w" onClick={() => { apply(A.decideRequest(r.id, 'approved')); setDlg(null); }}>Schválit</button><button className="btn lg w" onClick={() => { apply(A.decideRequest(r.id, 'rejected')); setDlg(null); }}>Zamítnout, znovu může za 30 dní</button><button className="q r" onClick={() => { apply(A.decideRequest(r.id, 'blocked')); setDlg(null); }}>Zablokovat další žádosti</button></div></Dialog> : null}
    {req.length ? <Sec h="Žádosti o přístup">{req.map((x) => <div className="it" key={x.id}><span className="tx"><span className="tt">{x.name}</span><span className="st">{x.reason}</span><span className="st">{x.email}, {WHEN(x.at)}</span></span><button className="btn go" onClick={() => setDlg(x.id)}>Rozhodnout</button></div>)}</Sec> : null}
    <label className="l">Najít člověka<input className="in" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Jméno nebo e-mail" /></label>
    <Sec h={`Všichni (${us.length})`}>{us.map((u) => <Item key={u.id} to={`/lide/${u.id}`} t={Q.nameOf(u)} st={`${ROLE[u.role]}${u.isStudent ? ', student' : ''}${u.status === 'blocked' ? ', zablokovaný účet' : ''}`} />)}{us.length === 0 ? <p className="sm">Nikdo takový tu není.</p> : null}</Sec>
  </Pane>;
}
export function Clovek({ id }: { id: string }) {
  const { s, apply } = useStore(); const u = s.users.find((x) => x.id === id); const [ok, setOk] = useState(false); if (!u) return <NotFound />;
  const self = u.id === s.userId; const need = A.needsReauth(s);
  const set = (p: Parameters<typeof A.setUser>[1]) => { apply(A.setUser(id, p)); setOk(true); };
  return <Pane on="/lide"><Back to="/lide" t="Zpět na lidi" /><Top h={Q.nameOf(u)} lead={u.email} />
    {ok ? <Toast onDone={() => setOk(false)}>Uloženo</Toast> : null}
    {self ? <Note h="Tohle jste vy">Svou roli ani účet si sami nezměníte. Jediný ředitel nejdřív povýší zástupce.</Note> : need ? <section className="stack st8"><Note h="Nejdřív ověříme, že jste to vy">Změna role patří k citlivým věcem, proto vás Microsoft požádá o nové přihlášení. Ověření platí 10 minut.</Note><button className="btn go lg" onClick={() => apply(A.stepUp)}>Ověřit přihlášením</button></section> : <>
      <section className="stack st8"><h2>Co smí</h2><Seg label="Role" value={u.role} options={(u.isStudent ? (['submitter', 'pending'] as const) : (['submitter', 'reviewer', 'headmaster', 'pending'] as const)).map((r) => [r, ROLE[r]] as const)} onChange={(v) => set({ role: v })} />{u.isStudent ? <p className="sm">Student může jen psát zprávy.</p> : null}</section>
      <label className="chk"><input type="checkbox" checked={u.isStudent} onChange={(e) => set({ isStudent: e.target.checked })} />Je to student</label>
      <section className="stack st8"><h2>Účet</h2><button className="btn" onClick={() => set({ status: u.status === 'blocked' ? 'active' : 'blocked' })}>{u.status === 'blocked' ? 'Odblokovat účet' : 'Zablokovat účet'}</button></section>
    </>}
  </Pane>;
}
export function Seznamy() {
  const { s, apply } = useStore(); const u = Q.me(s)!; const staff = u.role === 'headmaster'; const [adding, setNew] = useState(false); const [nm, setNm] = useState(''); const [lb, setLb] = useState('');
  if (!Q.atLeast(u.role, 'reviewer') ) return <NotFound />;
  const body = <><Top h="Seznamy studentů" lead="Plní Přílohu 1 a bod o uvolnění z výuky." /><Sec h="Seznamy">{s.registry.filter((l) => !l.archived).map((l) => <Item key={l.key} to={`/seznamy/${l.key}`} t={l.name} st={`${Q.counts(l.entries.length, 'student', 'studenti', 'studentů')}${l.entries.some((e) => e.isNew) ? `, ${Q.counts(l.entries.filter((e) => e.isNew).length, 'nový', 'noví', 'nových')}` : ''}`} />)}</Sec>{staff ? <div className="row wr"><button type="button" className="btn" onClick={() => setNew(true)}><Ic n="plus" />Nový seznam</button><a className="btn" href="#/novy-rok">Nový školní rok</a></div> : null}{adding ? <Dialog title="Nový seznam" onClose={() => setNew(false)}><ListFields name={nm} label={lb} onName={setNm} onLabel={setLb} /><button type="button" className={`btn lg w ${nm.trim() && lb.trim() ? 'go' : 'off'}`} aria-disabled={!nm.trim() || !lb.trim()} onClick={() => { if (!nm.trim() || !lb.trim()) return; apply(A.addList(nm.trim(), lb.trim())); setNm(''); setLb(''); setNew(false); }}>Vytvořit seznam</button></Dialog> : null}</>;
  return staff ? <Pane on="/seznamy">{body}</Pane> : <div className="work solo"><Bar /><main className="pane">{body}</main><PhoneBar /></div>;
}
const PROB: Record<string, string> = { 'name-missing': 'chybí jméno', 'class-missing': 'chybí třída', 'class-unknown': 'neznámá třída', duplicate: 'už v seznamu je' };
/** The two names of a list: the one in the app and the one its line starts with in the bod o uvolnění. */
function ListFields({ name, label, onName, onLabel }: { name: string; label: string; onName: (v: string) => void; onLabel: (v: string) => void }) {
  return <div className="stack"><label className="l">Název<small>Jak se seznam jmenuje v aplikaci</small><input className="in" maxLength={120} autoFocus value={name} onChange={(e) => onName(e.target.value)} /></label><label className="l">Text v dokumentu<small>Vyjde před jmény, například: seznam studentů uvolněných z Němčiny</small><input className="in" maxLength={300} value={label} onChange={(e) => onLabel(e.target.value)} /></label></div>;
}
export function Seznam({ id }: { id: string }) {
  const { s, apply } = useStore(); const u = Q.me(s)!; const l = s.registry.find((x) => x.key === id); const edit = u.role === 'headmaster';
  const [txt, setTxt] = useState(''); const [rows, setRows] = useState<PasteRow[] | null>(null); const [rm, setRm] = useState<string | null>(null); const [q, setQ] = useState(''); const [nm, setNm] = useState(l?.name ?? ''); const [lb, setLb] = useState(l?.docLabel ?? '');
  const [ed, setEd] = useState<{ id: string; givenName: string; familyName: string; classCode: string } | null>(null); const [edErr, setEdErr] = useState(false);
  const putEd = (p: Partial<NonNullable<typeof ed>>) => setEd(ed && { ...ed, ...p });
  const edClass = ed ? (normalizeClass(ed.classCode.trim()) ?? ed.classCode.trim()) : ''; const badClass = !!edClass && !isClassCode(edClass); const [saving, setSaving] = useState(false);
  const edOk = !!ed && !!ed.givenName.trim() && !!ed.familyName.trim() && !!edClass && !badClass && !saving;
  // The state carries no version of an entry; the list's own read does.
  const saveEd = async () => {
    if (!ed || !edOk) return;
    setSaving(true);
    const r = await fetch('/api/arch/run', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'registry.read', input: { key: id } }) }).catch(() => null);
    const out = (await r?.json().catch(() => null)) as { data?: { current?: { entries: { id: string; version: number }[] } } } | null | undefined;
    const version = out?.data?.current?.entries.find((x) => x.id === ed.id)?.version;
    setSaving(false);
    if (!version) { setEdErr(true); return; }
    apply(A.editEntry(id, ed.id, { givenName: ed.givenName.trim(), familyName: ed.familyName.trim(), classCode: edClass }, version)); setEd(null); setEdErr(false);
  };
  if (!l || !Q.atLeast(u.role, 'reviewer')) return <NotFound />;
  const good = rows?.filter((r) => !r.problems.length) ?? [];
  const body = <><Back to="/seznamy" t="Zpět na seznamy" /><Top h={l.name} lead={`${Q.counts(l.entries.length, 'student', 'studenti', 'studentů')}. Noví od minulého dokumentu jsou tučně.`} />
    {edit ? <section className="stack st8"><label className="l">Vložit seznam<small>Každé jméno na řádek, nebo tak, jak je v dokumentu: Jana Nováková (1.A), Anna Malá (2.B)</small><textarea className="in" value={txt} onChange={(e) => { setTxt(e.target.value); setRows(null); }} /></label>{rows ? <><ul className="todo">{rows.map((r, i) => <li key={i}><span className={`mk ${r.problems.length ? 'x' : ''}`}>{r.problems.length ? <i /> : <Ic n="chk" />}</span><span>{r.givenName} {r.familyName}{r.classCode ? `, ${r.classCode}` : ''}{r.problems.length ? `: ${r.problems.map((p) => PROB[p]).join(', ')}` : ''}</span></li>)}</ul><button className={`btn lg ${good.length ? 'go' : 'off'}`} aria-disabled={!good.length} onClick={() => { if (good.length) { apply(A.addEntries(id, good.map((r) => ({ givenName: r.givenName, familyName: r.familyName, classCode: r.classCode! })))); setTxt(''); setRows(null); } }}>Přidat {good.length} {good.length === 1 ? 'studenta' : good.length < 5 ? 'studenty' : 'studentů'}</button></> : <button className={`btn ${txt.trim() ? '' : 'off'}`} aria-disabled={!txt.trim()} onClick={() => txt.trim() && setRows(parsePaste(txt, 'given-family', l.entries))}>Zkontrolovat seznam</button>}</section> : null}
    {edit && l.purpose === 'point4' ? <details className="qd"><summary>Přejmenovat seznam</summary><div className="stack st8"><ListFields name={nm} label={lb} onName={setNm} onLabel={setLb} /><button type="button" className={`btn ${nm.trim() && lb.trim() ? 'go' : 'off'}`} aria-disabled={!nm.trim() || !lb.trim()} onClick={() => { if (nm.trim() && lb.trim()) apply(A.renameList(id, nm.trim(), lb.trim())); }}>Uložit název</button></div></details> : null}
    {l.entries.length > 15 ? <label className="l"><span className="vh">Hledat ve seznamu</span><input className="in" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Hledat jméno nebo třídu" /></label> : null}
    <table className="tb"><thead><tr><th>Jméno</th><th>Třída</th>{edit ? <th className="hm"><span className="vh">Akce</span></th> : null}</tr></thead><tbody>{l.entries.filter((e) => !q.trim() || foldForSearch(`${e.givenName} ${e.familyName} ${e.classCode}`).includes(foldForSearch(q.trim()))).map((e) => <tr key={e.id} className={e.isNew ? 'nw-t' : ''}><td>{e.givenName} {e.familyName}</td><td>{e.classCode}</td>{edit ? <td><span className="row wr"><button type="button" className="q" aria-label={`Opravit: ${e.givenName} ${e.familyName}`} onClick={() => { setEdErr(false); setEd({ id: e.id, givenName: e.givenName, familyName: e.familyName, classCode: e.classCode }); }}>Opravit</button><button className="q r" aria-label={`Odebrat: ${e.givenName} ${e.familyName}`} onClick={() => setRm(e.id)}>Odebrat</button></span></td> : null}</tr>)}</tbody></table>
    {ed ? <Dialog title="Opravit studenta" onClose={() => setEd(null)}><div className="stack"><label className="l">Jméno<input className="in" maxLength={60} autoFocus value={ed.givenName} onChange={(e) => putEd({ givenName: e.target.value })} /></label><label className="l">Příjmení<input className="in" maxLength={60} value={ed.familyName} onChange={(e) => putEd({ familyName: e.target.value })} /></label><label className="l">Třída<input className="in" value={ed.classCode} onChange={(e) => putEd({ classCode: e.target.value })} />{badClass ? <small className="w-err">Takovou třídu neznáme, například 1.A</small> : null}</label></div>{edErr ? <p className="sm w-err" role="alert">Teď se to nepodařilo uložit. Zkuste to prosím znovu.</p> : null}<button type="button" className={`btn lg w ${edOk ? 'go' : 'off'}`} aria-disabled={!edOk} onClick={() => void saveEd()}>Uložit opravu</button></Dialog> : null}
    {rm ? <Dialog title="Odebrat ze seznamu?" onClose={() => setRm(null)}><div className="row"><button className="btn lg" onClick={() => setRm(null)}>Nechat</button><button className="btn dk lg" onClick={() => { apply(A.removeEntry(id, rm)); setRm(null); }}>Odebrat</button></div></Dialog> : null}</>;
  return edit ? <Pane on="/seznamy">{body}</Pane> : <div className="work solo"><Bar /><main className="pane">{body}</main><PhoneBar /></div>;
}
export function NovyRok() {
  const { s, apply } = useStore(); const [keys, setKeys] = useState<string[]>(s.registry.map((l) => l.key)); const [done, setDone] = useState(false); const need = A.needsReauth(s);
  return <Pane on="/seznamy"><Back to="/seznamy" t="Zpět na seznamy" /><Top h="Nový školní rok" lead="Vybrané seznamy se uloží k končícímu roku. Studenti, kteří se nikdy nevytiskli, se smažou." />
    {done ? <Note h="Hotovo">Seznamy jsou uložené k minulému roku.</Note> : need ? <section className="stack st8"><Note h="Nejdřív ověříme, že jste to vy">Tohle je citlivý krok, proto vás Microsoft požádá o nové přihlášení.</Note><button className="btn go lg" onClick={() => apply(A.stepUp)}>Ověřit přihlášením</button></section> : <><ul className="stack st8">{s.registry.map((l) => <li key={l.key}><label className="chk"><input type="checkbox" checked={keys.includes(l.key)} onChange={(e) => setKeys(e.target.checked ? [...keys, l.key] : keys.filter((k) => k !== l.key))} />{l.name}</label></li>)}</ul><button className="btn dk lg" onClick={() => { apply(A.newSchoolYear(keys)); setDone(true); }}>Začít nový školní rok</button></>}
  </Pane>;
}
export function Typy() { const { s, apply } = useStore(); return <Pane on="/typy"><Top h="Typy zpráv" lead="Určují úvodní větu a co se při psaní ptáme." /><Sec h="Typy">{s.types.map((t) => <Item key={t.id} to={`/typy/${t.id}`} t={t.name} st={`${t.bullets.map((b) => b.label).join(', ')}${t.active ? '' : ', skrytý'}`} />)}</Sec><button className="btn" onClick={() => { apply(A.saveType(null, {})); }}><Ic n="plus" />Nový typ</button></Pane>; }
export function Typ({ id }: { id: string }) {
  const { s, apply } = useStore(); const t = s.types.find((x) => x.id === id); if (!t) return <NotFound />;
  const set = (p: Partial<typeof t>) => apply(A.saveType(id, p));
  return <Pane on="/typy"><Back to="/typy" t="Zpět na typy" /><Top h={t.name} {...(t.locked ? { lead: 'Tento typ musí zůstat, aby vždy bylo co vybrat.' } : {})} /><label className="l">Název<input className="in" value={t.name} onChange={(e) => set({ name: e.target.value })} /></label>
    <section className="stack st8"><h2>Co se při psaní ptáme</h2><ul className="prs">{t.bullets.map((b, i) => <li className="pr" key={b.key}><div className="pr-h"><input className="in" aria-label="Název řádku" value={b.label} onChange={(e) => set({ bullets: t.bullets.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} /></div><label className="chk"><input type="checkbox" checked={b.required} onChange={(e) => set({ bullets: t.bullets.map((x, j) => (j === i ? { ...x, required: e.target.checked } : x)) })} />Povinné</label></li>)}</ul></section>
    {!t.locked ? <label className="chk"><input type="checkbox" checked={t.active} onChange={(e) => set({ active: e.target.checked })} />Nabízet při psaní</label> : null}
  </Pane>;
}
export function Nastaveni() {
  const { s, apply } = useStore(); const c = s.settings; const [d, setD] = useState(String(-c.dayOffset)); const [t, setT] = useState(c.time); const [soft, setSoft] = useState(c.remindSoft); const [hard, setHard] = useState(c.remindHard); const [ok, setOk] = useState(false);
  const day = ['neděli', 'sobotu', 'pátek', 'čtvrtek'][Number(d) - 1];
  return <Pane on="/nastaveni"><Top h="Nastavení" />{ok ? <Toast onDone={() => setOk(false)}>Uloženo. Termíny, které už lidé viděli, se nezměnily.</Toast> : null}
    <section className="stack"><h2>Uzávěrka</h2><div className="two"><label className="l">Kolik dní před poradou<select className="in" value={d} onChange={(e) => setD(e.target.value)}>{[1, 2, 3, 4].map((x) => <option key={x} value={x}>{x === 1 ? '1 den' : `${x} dny`}</option>)}</select></label><label className="l">V kolik hodin<select className="in" value={t} onChange={(e) => setT(e.target.value)}>{Array.from({ length: 57 }, (_, i) => { const m = 8 * 60 + i * 15; const v = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; return <option key={v}>{v}</option>; })}</select></label></div><div className="fx" role="status">Pro pondělní poradu to znamená {day} v {t}. Termíny, které už lidé viděli, se nezmění.</div></section>
    <section className="stack st8"><h2>Připomínky e-mailem</h2><label className="chk"><input type="checkbox" checked={soft} onChange={(e) => setSoft(e.target.checked)} />Dva dny před uzávěrkou organizátorům akcí bez zprávy</label><label className="chk"><input type="checkbox" checked={hard} onChange={(e) => setHard(e.target.checked)} />V den uzávěrky autorům rozepsaných a vrácených zpráv</label></section>
    <button className="btn go lg" onClick={() => { apply(A.saveSettings({ dayOffset: -Number(d), time: t, remindSoft: soft, remindHard: hard })); setOk(true); }}>Uložit</button>
  </Pane>;
}
export function Ucet() {
  const { s, apply } = useStore(); const u = Q.me(s)!; const [all, setAll] = useState(false);
  return <div className="work solo"><Bar /><main className="pane narrow"><Back to="/" t="Zpět" /><Top h={Q.nameOf(u)} lead={`${u.email}. Přihlašujete se školním účtem, heslo u nás nemáte.`} /><div className="stack st8"><button className="btn lg w" onClick={() => { apply(A.signOut); go('/'); }}>Odhlásit se</button><button className="btn lg w" onClick={() => setAll(true)}>Odhlásit všude</button><a className="q" href="#/soukromi">Jak s údaji zacházíme</a></div>{all ? <Dialog title="Odhlásit všude?" onClose={() => setAll(false)}><p>Odhlásíme vás na všech zařízeních.</p><button className="btn dk lg w" onClick={() => { apply(A.signOutAll); go('/'); }}>Odhlásit všude</button></Dialog> : null}</main><PhoneBar /></div>;
}
/** The sign-in leaves through the server, which never sees the #address a mail link opened. */
const rememberAddress = () => { try { sessionStorage.setItem('arch-after-login', location.hash); } catch { /* soukromé okno */ } };
export function Soukromi() { return <div className="work solo"><main className="pane narrow"><Back to="/" t="Zpět" /><Top h="Jak s údaji zacházíme" /><div className="prose"><p>Autoporada slouží k přípravě týdenní porady vedení školy. Zpracovává jména a e-maily zaměstnanců a studentů a texty, které do ní napíšete.</p><p>Hesla neukládáme, přihlašujete se školním účtem Microsoft. Rozepsané zprávy a žádosti se mažou na konci školního roku. Záznam o tom, kdo co udělal, držíme 3 roky.</p><p>Studenti vidí jen své zprávy a schválené akce. Celou poradu vidí jen zaměstnanci ve vedení.</p></div></main></div>; }
/** Sign-in and access: the only screens before you have a place on the desk. */
export function Entry({ children }: { children: React.ReactNode }) {
  return <div className="lay"><div className="work"><header className="bar"><span className="logo"><img src={logo} alt="Smíchovská střední" /></span></header><main className="col mid" tabIndex={-1} data-focus-top>{children}</main></div><Desk cls="tall"><div className="wrapm wrapn"><div className="arch"><div className="t">Porada vedení školy</div><div className="s">Pokyny pro zaměstnance, organizační záležitosti</div></div></div></Desk></div>;
}
/** What the address says about the last sign-in or sign-out, checked as `server/pages/sign-in.ts` checks it. */
function signInOutcome() {
  const q = new URLSearchParams(location.search); const chyba = q.get('chyba'); const aadsts = q.get('aadsts'); const pricina = q.get('pricina'); const out = q.get('odhlaseno');
  const error = isSignInError(chyba) ? chyba : null;
  const failed = error === null ? null : error === 'idp-refused' && isAadstsCode(aadsts) ? signIn.refusedWithCode(aadsts) : error === 'signout-failed' && isFailureCause(pricina) ? `${signIn.errors[error]} ${failures[pricina]}` : signIn.errors[error];
  const gone = out === 'vsude' ? signIn.loggedOut.everywhere : out === '1' ? signIn.loggedOut.here : null;
  return { failed, gone, shared: gone !== null || error === 'signout-failed' };
}
const LOGIN = '/auth/login?returnTo=%2F'; const SWITCH = `${LOGIN}&account=select`;
export function Login() {
  const { failed, gone, shared } = signInOutcome();
  return <Entry><div className="top"><h1 className="big">Porada vedení školy</h1><p className="lead">Tady se každý týden skládá dokument. Přihlaste se a uvidíte, co čeká na vás.</p></div>
    {failed ? <p className="note err" role="alert">{failed}</p> : null}
    {gone ? <p className="note" role="status">{gone}</p> : null}
    {shared ? <p className="sm">{signIn.loggedOut.sharedComputer}</p> : null}
    {/* After a sign-out Entra still knows the browser: on a shared computer the next person must choose (risk 12). */}
    <a className="btn go lg w" href={shared ? SWITCH : LOGIN} onClick={rememberAddress}>{signIn.button}</a>
    <a className="q" href={SWITCH} onClick={rememberAddress}>{signIn.switchAccount}</a>
    <a className="q" href="#/soukromi">Jak s údaji zacházíme</a></Entry>;
}
export function Pristup() {
  const { s, apply } = useStore(); const u = Q.me(s)!; const [r, setR] = useState('');
  const req = [...s.requests].reverse().find((x) => x.email === u.email);
  const out = <button className="q" onClick={() => { apply(A.signOut); go('/'); }}>Zpět na přihlášení</button>;
  if (u.status === 'blocked' || req?.state === 'blocked') return <Entry><Top h="Přístup není možný" lead="Další žádosti z tohoto účtu jsou zablokované. Když si myslíte, že jde o omyl, promluvte si s ředitelem. Přístup vám může dát ručně." />{out}</Entry>;
  if (req?.state === 'pending') return <Entry><Top h="Žádost je u ředitele" lead={`Rozhodnutí vám přijde e-mailem na ${u.email}. Mezitím nemusíte nic dělat.`} /><button className="btn lg w" onClick={() => apply(A.cancelRequest(req.id))}>Zrušit žádost</button>{out}</Entry>;
  if (req?.state === 'rejected') { const when = new Date(new Date(req.decidedAt!).getTime() + 30 * 864e5).toISOString(); return <Entry><Top h="Žádost nebyla schválena" lead={`Znovu požádat můžete od ${Q.fromDay(WHEN(when))}. Potřebujete-li přístup dřív, domluvte se s ředitelem.`} />{out}</Entry>; }
  return <Entry><Top h="Zatím tu nemáte přístup" lead="Napište řediteli, proč ho potřebujete. Rozhodnutí vám přijde e-mailem." /><label className="l">Proč přístup potřebujete<textarea className="in" autoFocus value={r} onChange={(e) => setR(e.target.value)} /></label><button className={`btn lg w ${r.trim() ? 'go' : 'off'}`} aria-disabled={!r.trim()} onClick={() => r.trim() && apply(A.requestAccess(r))}>Odeslat žádost</button>{out}</Entry>;
}
export { App };
