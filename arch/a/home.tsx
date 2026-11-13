import { useState } from 'react';
import { useStore, createWith, go } from '../core/react';
import * as Q from '../core/select';
import * as A from '../core/ops';
import type { Future, Point } from '../core/types';
import { App, Back, Desk, Dialog, focusOn, Hash, Ic, Item, Sec, Seg, Sheet, Stamp, Top, Track, TrailMore, WHEN, diffWords, Note, Todo } from './ui';
import { foldForSearch } from '@/domain/cs';
import { DocNav } from '../core/parts';
import { toText } from '../core/react';

export const guessType = (t: string) => { const x = t.toLowerCase(); return x.startsWith('exkurz') ? 'exkurze' : x.startsWith('soutěž') ? 'soutez' : x.startsWith('seminář') ? 'seminar' : x.startsWith('přednášk') ? 'prednaska' : x.startsWith('projektový den') ? 'projektovy' : 'jine'; };
const Task = ({ t, why, a, prim, onClick }: { t: string; why: string; a: string; prim?: boolean; onClick: () => void }) => (
  <button type="button" className={`tk${prim ? ' p' : ''}`} onClick={onClick}><span className="tx"><b>{t}</b><span>{why}</span></span><span className={`btn${prim ? ' go' : ''} lg`}>{a}</span></button>
);
export function useOwedTasks() {
  const { s, apply } = useStore(); const u = Q.me(s)!;
  return Q.owedBy(s, u.id).map((o) => {
    const when = o.pastClose ? `Termín byl ${Q.dm(o.close.toISOString().slice(0, 10))}, ale porada na zprávu ještě čeká.` : o.late ? `Odevzdejte do ${WHEN(o.close)}, vyjde v poradě ${Q.dm(o.monday)}` : `Akce skončila. Napište, jak to dopadlo.`;
    const why = o.point?.state === 'returned' ? `${Q.nameOf(Q.userById(s, o.point.trail.at(-1)?.who ?? ''))} prosí o doplnění.` : o.point && toText(o.point.content.body).trim() ? `Máte rozepsáno. ${when}` : when;
    const act = () => {
      if (o.point) { go(o.point.state === 'returned' ? `/oprava/${o.point.id}` : `/psat/${o.point.id}`); return; }
      const id = createWith(apply, s, (cb) => A.createPoint('report', guessType(o.akce.title), o.akce.id, cb));
      go(`/psat/${id}`);
    };
    return { key: o.akce.id, t: o.akce.title, why, a: o.point?.state === 'returned' ? 'Opravit' : o.point ? 'Pokračovat' : 'Napsat zprávu', act };
  });
}
const pointLine = (s: ReturnType<typeof useStore>['s'], p: Point) => {
  const m = p.poradaMonday ? Q.dm(p.poradaMonday) : '';
  switch (p.state) {
    case 'draft': return 'Rozepsané, zatím jen u vás';
    case 'submitted': return `U vedení, poslali jste ${p.submittedAt ? Q.dm(new Date(p.submittedAt).toISOString().slice(0, 10)) : ''}`;
    case 'returned': return 'Vráceno, čeká na vaši opravu';
    case 'approved': return `Schváleno, vyjde v poradě ${m}`;
    case 'published': return `Vyšlo v poradě ${m}`;
    case 'rejected': return 'Zamítnuto';
    case 'withdrawn': return '';
  }
};
const futureLine = (f: Future) => ({ draft: 'Rozepsaná, zatím jen u vás', submitted: f.changed ? 'Změna čeká na kontrolu vedení' : 'U vedení', returned: 'Vrácená, čeká na vaši opravu', approved: f.cancelRequested ? 'Zrušení čeká na vedení' : 'Schválená, vidí ji škola', rejected: 'Zamítnutá', cancelled: 'Zrušená', withdrawn: '' }[f.state]);
const pointTo = (p: Point) => (p.state === 'draft' ? `/psat/${p.id}` : p.state === 'returned' ? `/oprava/${p.id}` : `/zprava/${p.id}`);

function deskFor(s: ReturnType<typeof useStore>['s'], meId: string) {
  const m = Q.workingMonday(s); const b = Q.buildDoc(s, m, { pending: true });
  const mine = new Set(Q.myPoints(s, meId).map((p) => p.id));
  const seen = b.segments.filter((x) => x.kind === 'report' && mine.has(x.key)).length;
  return <Desk cls="mg clip" fold={`Otevřít celou poradu, ${Q.pagesText(Q.pagesOf(b))}`} right={<DocNav built={b} attention={{ label: 'Vaše části', test: (i) => mine.has(i.key) }} />} note={<><b>Porada {Q.dm(s.issues.find((i) => i.monday === m)?.meetingDate ?? m)}</b> {seen ? 'Vaše části jsou žlutě.' : 'Zatím v ní nemáte žádnou část.'}</>}><div className="wrapm wrapn"><Sheet built={b} cls={(x) => (mine.has(x.key) ? 'me' : x.state === 'submitted' || x.kind === 'missing' ? 'peek' : '')} onSeg={(x) => { const p = s.points.find((k) => k.id === x.key); if (p && mine.has(p.id)) go(pointTo(p)); }} /></div></Desk>;
}
export function Tyden() {
  const { s } = useStore(); const u = Q.me(s)!; const tasks = useOwedTasks(); const [add, setAdd] = useState(false);
  const iss = Q.handInTo(s); const wk = Q.working(s); const after = Q.toIsoDate(iss.monday) !== Q.toIsoDate(wk.monday);
  const review = u.role === 'reviewer' ? Q.queuePoints(s).filter((p) => Q.canDecidePoint(u, p)).length + Q.queueFutures(s).filter((f) => Q.canDecideFuture(u, f)).length : 0;
  const sent = Q.myPoints(s, u.id).filter((p) => ['submitted', 'approved'].includes(p.state));
  const events = Q.upcoming(s).filter((f) => f.kind === 'akce').slice(0, 3);
  const draftProposals = Q.myPoints(s, u.id).filter((p) => p.kind !== 'report' && p.state === 'draft');
  const dl = WHEN(wk.deadlineAt);
  const lead = after
    ? <>Termín porady {Q.dm(wk.meetingDate)} minul. Nová zpráva půjde na poradu <b>{Q.dm(iss.meetingDate)}</b>.</>
    : review ? <><b>{review} {review === 1 ? 'položka čeká' : review < 5 ? 'položky čekají' : 'položek čeká'}</b> na vaše rozhodnutí. Termín je <b>{dl}</b>.</>
      : tasks.length ? <>Čeká na vás <b>{tasks.length === 1 ? '1 věc' : tasks.length < 5 ? `${tasks.length} věci` : `${tasks.length} věcí`}</b>. Termín je <b>{dl}</b>, to je za {Q.untilText(s, wk.deadlineAt)}.</> : <>Teď na vás nic nečeká.</>;
  return (
    <App over={add ? <AddDialog onClose={() => setAdd(false)} /> : null} desk={u.isStudent ? <Desk cls="mg clip" note={<b>Vaše části porady.</b>}>{(() => { const mine = Q.myPoints(s, u.id).filter((p) => p.kind === 'report' && p.state !== 'draft')[0]; const b = Q.buildDoc(s, Q.workingMonday(s), { pending: true }); return <div className="wrapm wrapn">{mine ? <Sheet built={focusOn(b, mine.id)} cls={(x) => (x.key === mine.id ? 'me' : '')} /> : <div className="arch"><p className="center">Tady uvidíte, jak bude vypadat vaše zpráva.</p></div>}</div>; })()}</Desk> : deskFor(s, u.id)}
      col={<>
        <Back to="/" t="Domů" /><Top big h="Čeká na vás" lead={lead} />
        {review ? <a className="btn go lg w" href="#/kontrola">Začít kontrolu</a> : null}
        {tasks.length ? <div className="tks">{tasks.map((t, i) => <Task key={t.key} t={t.t} why={t.why} a={t.a} prim={i === 0 && !review} onClick={t.act} />)}</div> : null}
        <button type="button" className="add" onClick={() => (u.role === 'headmaster' ? go('/pridat') : setAdd(true))}><span>{u.role === 'headmaster' ? 'Přidat do porady' : u.role === 'reviewer' ? 'Přidat zprávu, akci nebo návrh' : 'Přidat zprávu nebo akci'}</span><b><Ic n="plus" /></b></button>
        {draftProposals.length ? <Sec h="Rozepsané návrhy">{draftProposals.map((p) => <Item key={p.id} to={`/navrh/${p.id}`} t={p.content.title || 'Návrh bez názvu'} st="Do pokynů nebo hospodaření" mk="o" />)}</Sec> : null}
        {sent.length ? <Sec h="Už jste poslali" right={<a href="#/moje">Všechny</a>}>{sent.slice(0, 4).map((p) => <Item key={p.id} to={pointTo(p)} t={p.content.title} st={pointLine(s, p)} mk={p.state === 'approved' ? 'c' : 'o'} />)}</Sec> : null}
        {events.length ? <Sec h="Co se chystá ve škole" right={<a href="#/akce">Všechny akce</a>}>{events.map((f) => <Item key={f.id} to={`/akce/${f.id}`} t={f.title} st={[Q.dm(f.date), f.organizer.trim()].filter(Boolean).join(', ')} />)}</Sec> : null}
      </>} />
  );
}
type Tile = { t: string; ic: string; tone: string; to?: string; act?: () => void; n?: number };
/** Home: one tile per thing you can do here, the count of what waits on it in the corner. */
export function Domu() {
  const { s, apply } = useStore(); const u = Q.me(s)!; const tasks = useOwedTasks();
  const head = u.role === 'headmaster'; const staff = Q.atLeast(u.role, 'reviewer');
  const q = staff ? Q.queuePoints(s).filter((p) => Q.canDecidePoint(u, p)).length + Q.queueFutures(s).filter((f) => Q.canDecideFuture(u, f)).length + Q.placeholderQueue(s, u).length : 0;
  const req = head ? Q.pendingRequests(s).length : 0;
  const wk = Q.working(s); const dl = WHEN(wk.deadlineAt);
  const report = () => { const id = createWith(apply, s, (cb) => A.createPoint('report', 'jine', null, cb)); go(`/psat/${id}/zaklad`); };
  const future = (k: Future['kind']) => { const id = createWith(apply, s, (cb) => A.createFuture(k, cb)); go(`/nova-akce/${id}`); };
  const proposal = () => { const id = createWith(apply, s, (cb) => A.createPoint('finance', null, null, cb)); go(`/navrh/${id}`); };
  const waits: Tile = { t: 'Čeká na vás', ic: 'bell', tone: 'browse', to: '/tyden', n: tasks.length };
  const start: Tile[] = [{ t: 'Nová akce', ic: 'calp', tone: 'act', act: () => future('akce') }, { t: 'Schůzka s\u00a0partnery', ic: 'talk', tone: 'act', act: () => future('jednani') }];
  // Most reports answer an akce from „Čeká na vás“; a report of one's own is the exception, so it sits lighter.
  const write: Tile = { t: 'Napsat zprávu', ic: 'pen', tone: 'browse', act: report };
  const mine: Tile[] = [{ t: 'Moje', ic: 'doc', tone: 'browse', to: '/moje' }, { t: 'Akce školy', ic: 'cal', tone: 'browse', to: '/akce' }];
  const tiles: Tile[] = head
    ? [{ t: 'Porada', ic: 'book', tone: 'core', to: '/porada' }, { t: 'Ke kontrole', ic: 'rev', tone: 'core', to: '/kontrola', n: q }, { t: 'Archiv', ic: 'stack', tone: 'core', to: '/archiv' }, { t: 'Přidat do porady', ic: 'plus', tone: 'act', to: '/pridat' }, ...(tasks.length ? [waits] : []), ...mine, { t: 'Lidé', ic: 'ppl', tone: 'browse', to: '/lide', n: req }, { t: 'Seznamy studentů', ic: 'list', tone: 'admin', to: '/seznamy' }, { t: 'Typy zpráv', ic: 'tag', tone: 'admin', to: '/typy' }, { t: 'Nastavení', ic: 'gear', tone: 'admin', to: '/nastaveni' }]
    : [{ ...waits, tone: 'act' }, ...start, ...(staff ? [{ t: 'Návrh do pokynů', ic: 'flag', tone: 'act', act: proposal }, { t: 'Ke kontrole', ic: 'rev', tone: 'core', to: '/kontrola', n: q }] : []), write, ...mine, ...(staff ? [{ t: 'Archiv', ic: 'stack', tone: 'browse', to: '/archiv' }] : [])];
  const waiting = q + tasks.length + req;
  const lead = waiting ? <>Na vás {waiting === 1 ? <>čeká <b>1 věc</b></> : waiting < 5 ? <>čekají <b>{waiting} věci</b></> : <>čeká <b>{waiting} věcí</b></>}, poznáte je podle žlutých čísel. Termín je <b>{dl}</b>.</> : <>Teď na vás nic nečeká. Termín příští porady je <b>{dl}</b>.</>;
  const inner = (x: Tile) => <><Ic n={x.ic} />{x.n ? <span className="tl-n" aria-label={`${x.n} čeká`}>{x.n}</span> : null}<span className="tl-t">{x.t}</span></>;
  return <App desk={deskFor(s, u.id)} col={<>
    <Top big h="Dobrý den." lead={lead} />
    <ul className="tiles">{tiles.map((x, i) => <li key={x.t}>{x.to ? <a className={`tl t-${x.tone}${i % 3}`} href={`#${x.to}`}>{inner(x)}</a> : <button type="button" className={`tl t-${x.tone}${i % 3}`} onClick={x.act}>{inner(x)}</button>}</li>)}</ul>
  </>} />;
}
export function AddDialog({ onClose }: { onClose: () => void }) {
  const { s, apply } = useStore(); const u = Q.me(s)!;
  const report = () => { const id = createWith(apply, s, (cb) => A.createPoint('report', 'jine', null, cb)); go(`/psat/${id}/zaklad`); };
  const future = (k: Future['kind']) => { const id = createWith(apply, s, (cb) => A.createFuture(k, cb)); go(`/nova-akce/${id}`); };
  const proposal = () => { const id = createWith(apply, s, (cb) => A.createPoint('finance', null, null, cb)); go(`/navrh/${id}`); };
  return <Dialog title="Co chcete udělat?" onClose={onClose}>
    <button type="button" className="ch" onClick={report}><span className="tx"><b>Napsat zprávu z akce, která proběhla</b><span>Provedeme vás tím krok za krokem.</span></span><Ic n="chev" /></button>
    <button type="button" className="ch" onClick={() => future('akce')}><span className="tx"><b>Přidat akci, která se chystá</b><span>Po schválení ji uvidí celá škola.</span></span><Ic n="chev" /></button>
    <button type="button" className="ch" onClick={() => future('jednani')}><span className="tx"><b>Přidat schůzku s partnery</b><span>Objeví se v poradě, zprávu po ní nepíšete.</span></span><Ic n="chev" /></button>
    {Q.atLeast(u.role, 'reviewer') ? <button type="button" className="ch" onClick={proposal}><span className="tx"><b>Navrhnout něco do pokynů nebo hospodaření</b><span>Po schválení to ředitel zařadí do dokumentu.</span></span><Ic n="chev" /></button> : null}
  </Dialog>;
}
export function Moje() {
  const { s } = useStore(); const u = Q.me(s)!; const [add, setAdd] = useState(false);
  const pts = Q.myPoints(s, u.id); const fs = Q.myFutures(s, u.id);
  const empty = !pts.length && !fs.length;
  return <App over={add ? <AddDialog onClose={() => setAdd(false)} /> : null} desk={deskFor(s, u.id)} col={<>
    <Top big h="Moje" lead={empty ? 'Zatím tu nic nemáte. Až napíšete první zprávu, uvidíte ji tady i s tím, kde je.' : 'Všechno, co jste napsali, a kde to zrovna je.'} />
    <button type="button" className="add" onClick={() => (u.role === 'headmaster' ? go('/pridat') : setAdd(true))}><span>{u.role === 'headmaster' ? 'Přidat do porady' : 'Přidat zprávu nebo akci'}</span><b><Ic n="plus" /></b></button>
    {pts.length ? <Sec h="Zprávy a návrhy">{pts.map((p) => <Item key={p.id} to={p.kind === 'report' ? pointTo(p) : `/navrh/${p.id}`} t={p.content.title || 'Bez názvu'} st={pointLine(s, p)} mk={p.state === 'approved' || p.state === 'published' ? 'c' : p.state === 'returned' ? 'n' : p.state === 'rejected' ? 'x' : 'o'} warn={p.state === 'returned'} />)}</Sec> : null}
    {fs.length ? <Sec h="Moje akce a schůzky">{fs.map((f) => <Item key={f.id} to={`/akce/${f.id}`} t={f.title || 'Bez názvu'} st={`${Q.dm(f.date)}, ${futureLine(f)}`} mk={f.state === 'approved' ? 'c' : f.state === 'returned' ? 'n' : 'o'} />)}</Sec> : null}
    <a className="q" href="#/akce">Všechny akce školy</a>
  </>} />;
}
const STEPS = ['Napsáno', 'U vedení', 'Schváleno', 'V poradě'];
export function Zprava({ id, fresh }: { id: string; fresh?: boolean }) {
  const { s, apply } = useStore(); const p = s.points.find((x) => x.id === id); const u = Q.me(s);
  const [confirmDel, setDel] = useState(false);
  if (!p) return <NotFound />;
  const mine = p.authorId === u?.id; const m = p.poradaMonday ?? Q.workingMonday(s);
  const meet = Q.issueOf(s, m)?.meetingDate ?? m;
  const on = p.state === 'published' ? 4 : p.state === 'approved' ? 3 : p.state === 'submitted' ? 1 : 0;
  const stamp = { submitted: fresh ? 'Odesláno' : 'U vedení', approved: 'Schváleno', published: 'Vyšlo', rejected: 'Zamítnuto', draft: 'Rozepsáno', returned: 'Vráceno', withdrawn: 'Zrušeno' }[p.state];
  const edited = p.trail.filter((t) => t.original);
  const b = focusOn(Q.buildDoc(s, m, { draft: p }), p.id);
  const head = !fresh ? p.content.title : p.state === 'submitted' ? 'Hotovo, je to u vedení' : p.state === 'approved' ? 'Hotovo, je to v poradě' : p.content.title;
  const lead = p.state === 'submitted' ? `Až to přečtou, přijde vám e-mail. Teď už nemusíte nic dělat.` : p.state === 'approved' ? `Vyjde v poradě ${Q.dm(meet)}${edited.length ? ' Vedení text mírně upravilo.' : ''}` : p.state === 'published' ? `Vyšlo v poradě ${Q.dm(meet)}` : p.state === 'rejected' ? (p.note ?? 'Zpráva nevyjde.') : '';
  return <App nar desk={<Desk cls="tall" note={<b>Takhle to vyjde</b>}><div className="wrapm wrapn"><div className="arch-wrap rise"><Stamp t={stamp} /><Sheet built={b} cls={(x) => (x.key === p.id ? 'me' : '')} /></div></div></Desk>}
    over={confirmDel ? <Dialog title="Smazat zprávu?" onClose={() => setDel(false)}><p>Zpráva z poslaných zmizí a vedení ji už neuvidí. {Q.asksAgain(s, p) ? 'O zprávu z akce vás znovu požádáme.' : ''}</p><div className="row"><button className="btn lg" onClick={() => setDel(false)}>Nechat</button><button className="btn dk lg" onClick={() => { apply(A.withdrawPoint(p.id)); go('/'); }}>Smazat</button></div></Dialog> : null}
    col={<>
      <Back to={mine ? '/' : '/kontrola'} t={mine ? 'Zpět domů' : 'Zpět na kontrolu'} />
      <Top h={head} lead={lead} />
      {p.state !== 'rejected' && p.state !== 'withdrawn' ? <Track on={on} steps={[...STEPS.slice(0, 3), `V poradě ${Q.dm(meet)}`]} /> : null}
      {edited.map((t, i) => <Note key={i} h={`Úprava: ${Q.nameOf(Q.userById(s, t.who))}`}>{Object.entries(t.original!).map(([k, v]) => <p key={k} className="diff"><span className="sm">{k}</span><br />{k === 'Text' || k === 'Jak to dopadlo' ? diffWords(v, toText(p.content.body)) : v}</p>)}</Note>)}
      {p.state === 'submitted' && mine ? <div className="stack st8">{fresh ? <a className="btn go lg w" href="#/">Hotovo, zpět na přehled</a> : null}<button className="btn lg w" onClick={() => { apply(A.retractPoint(p.id)); go(`/psat/${p.id}/hotovo`); }}>Vzít zpět a upravit</button><button className="q r" onClick={() => setDel(true)}>Smazat zprávu</button></div> : null}
      {p.trail.length ? <Sec h="Co se dělo"><Todo rows={p.trail.map((t) => ({ k: 'd' as const, t: <>{t.what}: {Q.nameOf(Q.userById(s, t.who)) || 'systém'}, {WHEN(t.at)}<TrailMore labels={Q.partLabels(p, t.parts)} note={t.note} /></> }))} /></Sec> : null}
    </>} />;
}
export function Udalosti() {
  const { s } = useStore(); const all = Q.upcoming(s); const [q, setQ] = useState(''); const [kind, setKind] = useState<'all' | 'akce' | 'jednani'>('all'); const [more, setMore] = useState(false);
  const f0 = foldForSearch(q.trim());
  const hits = all.filter((f) => (kind === 'all' || f.kind === kind) && (!f0 || foldForSearch(`${f.title} ${f.organizer} ${f.participants} ${f.remark} ${f.place}`).includes(f0)));
  const limit = Q.toIsoDate(Q.addDays(Q.todayOf(s), 21)); const near = hits.filter((f) => Q.toIsoDate(f.date) <= limit);
  const list = more || f0 ? hits : near; const months = [...new Set(list.map((f) => Q.toIsoDate(f.date).slice(0, 7)))];
  const MONTH = ['Leden', 'Únor', 'Březen', 'Duben', 'Květen', 'Červen', 'Červenec', 'Srpen', 'Září', 'Říjen', 'Listopad', 'Prosinec'];
  return <App desk={deskFor(s, s.userId!)} col={<><Back to="/" t="Zpět" /><Top h="Co se chystá ve škole" lead={`Schválené akce a schůzky, které teprve budou: ${all.length}.`} />
    <div className="stack st8"><label className="l"><span className="vh">Hledat</span><input className="in" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Hledat název, jméno nebo místo" /></label><Seg label="Co ukázat" value={kind} options={[['all', 'Všechno'], ['akce', 'Akce'], ['jednani', 'Schůzky']]} onChange={setKind} /></div>
    {list.length ? months.map((mo) => <Sec key={mo} h={`${MONTH[Number(mo.slice(5)) - 1]} ${mo.slice(0, 4)}`}>{list.filter((f) => Q.toIsoDate(f.date).startsWith(mo)).map((f) => <Item key={f.id} to={`/akce/${f.id}`} t={Q.cap(f.title)} st={`${Q.dm(f.date)}${f.timeFrom ? ` v ${f.timeFrom.hour}:${String(f.timeFrom.minute).padStart(2, '0')}` : ''}${f.organizer.trim() ? `, ${f.organizer.trim()}` : ''}`} />)}</Sec>) : <Note>Nic takového se nechystá. Zkuste jiné slovo.</Note>}
    {!more && !f0 && hits.length > near.length ? <button type="button" className="btn lg w" onClick={() => setMore(true)}>Ukázat i pozdější: {hits.length - near.length}</button> : null}</>} />;
}
export function NotFound() {
  return <div className="lay full"><aside className="desk scroll err-w"><div className="arch err"><h1 className="big m">Tenhle list tu není</h1><p className="lead">Odkaz je starý, nebo k němu nemáte přístup. Váš přehled je na stejném místě jako vždy.</p><div><a className="btn dk lg" href="#/">Domů</a></div></div></aside></div>;
}
export { Hash, pointLine, pointTo, futureLine };
