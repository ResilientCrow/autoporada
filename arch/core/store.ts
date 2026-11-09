import { deadline, planNextMeeting, slotMondayOf } from '@/domain/calendar';
import { missingForSubmit, newDraft, openingInput, submittedContent, type DraftPerson, type PointContent, type PointKind } from '@/domain/report';
import { openingSentence } from '@/domain/cs';
import { addDays, parseIsoDate, parseWallTime, toIsoDate, type CalDate } from '@/domain/time';
import { emptyRichDoc, richDocFromText, richDocToPlainText, type RichDoc } from '@/domain/richtext';
import { parsePaste } from '@/domain/registry';
import { working, atLeast, buildDoc, canDecideFuture, canDecidePoint, handInTo, issueOf, me, nameOf, owedMonday, pointOfAkce, preflight, ruleOf, slotsOf, userById, yearOf } from './select';
import type { AccessReq, Annex, Future, Issue, Mail, Point, PointType, Role, Row, State, Trail } from './types';

type Fx = (s: State) => State;
const YEAR = '2026/2027';
const person = (salutation: DraftPerson['salutation'], givenName: string, familyName: string, affiliation?: string): DraftPerson => ({ salutation, givenName, familyName, ...(affiliation && { affiliation, affiliationYear: YEAR }) });


const id = (s: State, p: string): [State, string] => [{ ...s, seq: s.seq + 1 }, `${p}-${s.seq}`];
const trail = (s: State, what: string, extra: Partial<Trail> = {}): Trail => ({ at: s.now, who: s.userId ?? 'system', what, ...extra });
const up = <T extends { id: string }>(xs: T[], i: string, f: (x: T) => T) => xs.map((x) => (x.id === i ? f(x) : x));
const mail = (s: State, toId: string, subject: string, body: string): State => {
  const u = userById(s, toId); if (!u) return s;
  const m: Mail = { id: `m-${s.seq}-${s.mails.length}`, at: s.now, to: nameOf(u), subject, body };
  return { ...s, mails: [m, ...s.mails] };
};
const audit = (s: State, what: string): State => ({ ...s, audit: [{ at: s.now, who: s.userId ?? 'system', what }, ...s.audit] });
/** The working porada always has its row, whatever an action or the clock just moved. */
export const settle = (s: State): State => ensureIssue(s, toIsoDate(working(s).monday));
const ensureIssue = (s: State, monday: string): State => {
  if (issueOf(s, monday)) return s;
  const last = [...s.issues].sort((a, b) => a.monday.localeCompare(b.monday)).pop()!;
  const d = parseIsoDate(monday);
  const iss: Issue = { ...last, monday, meetingDate: monday, deadlineAt: deadline(d, ruleOf(s)).toISOString(), status: 'open', placeholders: {}, rows: last.rows.filter((r) => r.persistence === 'standing' || r.isNew).map((r) => ({ ...r, isNew: false })) };
  delete iss.doc; iss.annex2 = null; iss.annexes = [];
  return { ...s, issues: [...s.issues, iss] };
};
export const needsReauth = (s: State) => !s.stepUpAt || new Date(s.now).getTime() - new Date(s.stepUpAt).getTime() > 600_000;

// ---- session ----
export const signIn = (userId: string): Fx => (s) => ({ ...s, userId });
export const signOut: Fx = (s) => ({ ...s, userId: null, stepUpAt: null });
export const signOutAll: Fx = (s) => audit({ ...s, userId: null, stepUpAt: null }, 'Odhlášení všude');
export const stepUp: Fx = (s) => ({ ...s, stepUpAt: s.now });
export const setClock = (iso: string): Fx => (s) => ({ ...s, now: iso });

// ---- points ----
export function refreshOpening(s: State, p: Point, content: PointContent): PointContent {
  if (p.kind !== 'report' || content.openingEdited) return content;
  const type = s.types.find((t) => t.id === p.typeId);
  const input = openingInput(content, type?.titleGender ?? null, type?.bullets ?? []);
  return { ...content, opening: input ? openingSentence(input) : '' };
}
export function createPoint(kind: PointKind, typeId: string | null, akceId: string | null, onId?: (id: string) => void): Fx {
  return (s0) => {
    const [s, pid] = id(s0, 'p');
    const type = s.types.find((t) => t.id === typeId);
    const u = me(s)!; const akce = s.futures.find((f) => f.id === akceId);
    let content = newDraft(kind === 'report' ? type?.bullets ?? [] : []);
    if (akce) {
      content = { ...content, title: akce.title, eventDate: akce.date, endDate: akce.endDate, timeFrom: akce.timeFrom, timeTo: akce.timeTo, campus: akce.campus, place: akce.place || null, bullets: content.bullets.map((b) => (b.kind === 'people' && (b.key === 'organisers' || b.key === 'speakers') ? { ...b, people: akce.responsible.people } : b)) };
    } else if (kind === 'report' && u) {
      content = { ...content, bullets: content.bullets.map((b) => (b.kind === 'people' && b.key === 'organisers' ? { ...b, people: [person(u.salutation, u.givenName, u.familyName, u.affiliation)] } : b)) };
    }
    const p: Point = { id: pid, kind, typeId, authorId: u.id, akceId, content, state: 'draft', handInMonday: null, submittedAt: null, note: null, savedAt: s.now, trail: [] };
    p.content = refreshOpening(s, p, content);
    onId?.(pid);
    return { ...s, points: [...s.points, p], futures: akce ? up(s.futures, akce.id, (f) => ({ ...f, report: 'written' })) : s.futures };
  };
}
export const savePoint = (pid: string, content: PointContent): Fx => (s) => ({ ...s, points: up(s.points, pid, (p) => ({ ...p, content: refreshOpening(s, p, content), savedAt: s.now })) });
export type SubmitResult = { ok: true; monday: string } | { ok: false; why: 'problems' | 'report-not-due' };
export function trySubmit(s: State, pid: string): SubmitResult {
  const p = s.points.find((x) => x.id === pid)!;
  const spec = s.types.find((t) => t.id === p.typeId)?.bullets ?? [];
  if (missingForSubmit(p.kind, p.content, spec, yearOf(s)).problems.length) return { ok: false, why: 'problems' };
  const akce = s.futures.find((f) => f.id === p.akceId);
  if (akce) {
    const m = owedMonday(s, akce);
    if (issueOf(s, m)?.status === 'generated') return { ok: false, why: 'report-not-due' };
    return { ok: true, monday: m };
  }
  return { ok: true, monday: toIsoDate(handInTo(s).monday) };
}
export const submitPoint = (pid: string): Fx => (s0) => {
  const r = trySubmit(s0, pid); if (!r.ok) return s0;
  const s = ensureIssue(s0, r.monday);
  return { ...s, points: up(s.points, pid, (p) => ({ ...p, state: 'submitted', content: submittedContent(p.content, s.types.find((t) => t.id === p.typeId)?.bullets ?? []), handInMonday: r.monday, submittedAt: s.now, note: null, trail: [...p.trail, trail(s, 'Odesláno')] })) };
};
export const retractPoint = (pid: string): Fx => (s) => ({ ...s, points: up(s.points, pid, (p) => (p.state === 'submitted' ? { ...p, state: 'draft', trail: [...p.trail, trail(s, 'Vzato zpět')] } : p)) });
export const withdrawPoint = (pid: string): Fx => (s) => {
  const p = s.points.find((x) => x.id === pid)!;
  return { ...s, points: up(s.points, pid, (x) => ({ ...x, state: 'withdrawn', trail: [...x.trail, trail(s, 'Zrušeno')] })), futures: p.akceId ? up(s.futures, p.akceId, (f) => ({ ...f, report: 'prompted' })) : s.futures };
};
const placeProposal = (s: State, p: Point): State => {
  if (p.kind === 'report') return s;
  const m = toIsoDate(handInTo(s).monday); const s1 = ensureIssue(s, m);
  const section = p.kind === 'finance' ? 'hospodareni' : 'pokyny';
  return { ...s1, issues: s1.issues.map((i) => (i.monday !== m || i.rows.some((r) => r.pointId === p.id) ? i : { ...i, rows: [...i.rows, { id: `row-${p.id}`, section, slot: null, persistence: 'once', title: p.content.title, body: p.content.body, quotes: [], pointId: p.id, isNew: true } as Row] })) };
};
const decideMail = (s: State, p: Point, subject: string, body: string) => (p.authorId === s.userId ? s : mail(s, p.authorId, subject, body));
export const approvePoint = (pid: string): Fx => (s) => {
  const p = s.points.find((x) => x.id === pid)!;
  if (!canDecidePoint(me(s), p) || p.state !== 'submitted') return s;
  const after = { ...s, points: up(s.points, pid, (x) => ({ ...x, state: 'approved' as const, note: null, trail: [...x.trail, trail(s, 'Schváleno')] })) };
  return placeProposal(decideMail(after, p, `Schváleno: ${p.content.title}`, `Vaše zpráva vyjde v poradě.`), p);
};
export const returnPoint = (pid: string, note: string): Fx => (s) => {
  const p = s.points.find((x) => x.id === pid)!;
  if (!note.trim() || !atLeast(me(s)?.role, 'reviewer')) return s;
  return decideMail({ ...s, points: up(s.points, pid, (x) => ({ ...x, state: 'returned', note, trail: [...x.trail, trail(s, 'Vráceno k úpravě', { note })] })) }, p, `Vráceno k úpravě: ${p.content.title}`, note);
};
export const rejectPoint = (pid: string, note: string): Fx => (s) => {
  const p = s.points.find((x) => x.id === pid)!;
  if (!note.trim() || !atLeast(me(s)?.role, 'reviewer')) return s;
  return decideMail({ ...s, points: up(s.points, pid, (x) => ({ ...x, state: 'rejected', note, trail: [...x.trail, trail(s, 'Zamítnuto', { note })] })), futures: p.akceId ? up(s.futures, p.akceId, (f) => ({ ...f, report: 'prompted' })) : s.futures }, p, `Zamítnuto: ${p.content.title}`, note);
};
/** A reviewer's edit keeps the original wording of what changed („Původní znění“). */
export const editAsReviewer = (pid: string, content: PointContent): Fx => (s) => ({ ...s, points: up(s.points, pid, (p) => {
  const original: Record<string, string> = {};
  if (p.content.title !== content.title) original['Název'] = p.content.title;
  if (p.content.opening !== content.opening) original['Úvodní věta'] = p.content.opening;
  const a = richDocToPlainText(p.content.body), b = richDocToPlainText(content.body);
  if (a !== b) original['Text'] = a;
  return { ...p, content, savedAt: s.now, trail: Object.keys(original).length ? [...p.trail, trail(s, 'Upraveno vedením', { original })] : p.trail };
}) });

// ---- future items ----
export function createFuture(kind: Future['kind'], onId?: (id: string) => void): Fx {
  return (s0) => {
    const [s, fid] = id(s0, 'f'); const u = me(s)!; onId?.(fid);
    const tomorrow = parseIsoDate(toIsoDate(handInTo(s).monday));
    const f: Future = { id: fid, kind, authorId: u.id, title: '', date: tomorrow, endDate: null, timeFrom: null, timeTo: null, campus: 'smichov', place: '', responsible: { verb: kind === 'akce' ? 'organizuje' : 'vede', people: [person(u.salutation, u.givenName, u.familyName, u.affiliation)] }, state: 'draft', changed: false, note: null, report: 'none', submittedAt: null, savedAt: s.now, trail: [], dateSet: false };
    return { ...s, futures: [...s.futures, f] };
  };
}
export const saveFuture = (fid: string, patch: Partial<Future>): Fx => (s) => ({ ...s, futures: up(s.futures, fid, (f) => ({ ...f, ...patch, savedAt: s.now })) });
export const submitFuture = (fid: string): Fx => (s) => ({ ...s, futures: up(s.futures, fid, (f) => (f.title.trim() ? { ...f, state: 'submitted', submittedAt: s.now, note: null, trail: [...f.trail, trail(s, 'Odesláno')] } : f)) });
export const retractFuture = (fid: string): Fx => (s) => ({ ...s, futures: up(s.futures, fid, (f) => (f.state === 'submitted' ? { ...f, state: 'draft', trail: [...f.trail, trail(s, 'Vzato zpět')] } : f)) });
export const withdrawFuture = (fid: string): Fx => (s) => ({ ...s, futures: up(s.futures, fid, (f) => ({ ...f, state: 'withdrawn', trail: [...f.trail, trail(s, 'Zrušeno')] })) });
/** „Uložit změny“: an approved akce changes only through this; its author sends it back to review. */
export const reviseFuture = (fid: string, patch: Partial<Future>): Fx => (s) => ({ ...s, futures: up(s.futures, fid, (f) => { const author = f.authorId === s.userId; return { ...f, ...patch, ...(author ? { state: 'submitted' as const, changed: true, submittedAt: s.now } : {}), trail: [...f.trail, trail(s, author ? 'Změna, znovu ke kontrole' : 'Upraveno vedením')] }; }) });
export const approveFuture = (fid: string): Fx => (s) => { const f = s.futures.find((x) => x.id === fid)!; if (!canDecideFuture(me(s), f) || f.state !== 'submitted') return s; return { ...s, futures: up(s.futures, fid, (x) => ({ ...x, state: 'approved', changed: false, note: null, trail: [...x.trail, trail(s, 'Schváleno')] })) }; };
export const returnFuture = (fid: string, note: string): Fx => (s) => (!note.trim() ? s : { ...s, futures: up(s.futures, fid, (f) => ({ ...f, state: 'returned', note, trail: [...f.trail, trail(s, 'Vráceno k úpravě', { note })] })) });
export const rejectFuture = (fid: string, note: string): Fx => (s) => (!note.trim() ? s : { ...s, futures: up(s.futures, fid, (f) => ({ ...f, state: 'rejected', note, trail: [...f.trail, trail(s, 'Zamítnuto', { note })] })) });
export const cancelFuture = (fid: string): Fx => (s) => ({ ...s, futures: up(s.futures, fid, (f) => ({ ...f, state: 'cancelled', trail: [...f.trail, trail(s, 'Zrušeno')] })) });

// ---- porada ----
const patchIssue = (s: State, m: string, f: (i: Issue) => Issue) => ({ ...s, issues: s.issues.map((i) => (i.monday === m ? f(i) : i)) });
export const saveIssueTexts = (m: string, present: string, guests: string): Fx => (s) => patchIssue(s, m, (i) => ({ ...i, present, guests }));
export const setAnnex2 = (m: string, doc: RichDoc | null): Fx => (s) => patchIssue(s, m, (i) => ({ ...i, annex2: doc }));
export const addAnnex = (m: string, onId?: (id: string) => void): Fx => (s0) => { const [s, aid] = id(s0, 'annex'); onId?.(aid); return patchIssue(s, m, (i) => ({ ...i, annexes: [...i.annexes, { id: aid, title: '', parts: [] }] })); };
export const saveAnnex = (m: string, a: Annex): Fx => (s) => patchIssue(s, m, (i) => ({ ...i, annexes: i.annexes.map((x) => (x.id === a.id ? a : x)) }));
export const removeAnnex = (m: string, aid: string): Fx => (s) => patchIssue(s, m, (i) => ({ ...i, annexes: i.annexes.filter((x) => x.id !== aid) }));
export const moveAnnex = (m: string, aid: string, dir: -1 | 1): Fx => (s) => patchIssue(s, m, (i) => { const a = [...i.annexes]; const k = a.findIndex((x) => x.id === aid), j = k + dir; if (k < 0 || j < 0 || j >= a.length) return i; [a[k], a[j]] = [a[j]!, a[k]!]; return { ...i, annexes: a }; });
/** A proposal goes right after the chosen point of its section. */
export const placeRowAfter = (m: string, rid: string, afterId: string): Fx => (s) => patchIssue(s, m, (i) => { const row = i.rows.find((r) => r.id === rid); if (!row) return i; const rest = i.rows.filter((r) => r.id !== rid); const k = rest.findIndex((r) => r.id === afterId); return { ...i, rows: [...rest.slice(0, k + 1), { ...row, isNew: false }, ...rest.slice(k + 1)] }; });
export const setPlaceholder = (m: string, akce: string, text: string | null): Fx => (s) => patchIssue(s, m, (i) => { const placeholders = { ...i.placeholders }; if (text === null) delete placeholders[akce]; else placeholders[akce] = text; return { ...i, placeholders }; });
export const moveRow = (m: string, rid: string, dir: -1 | 1): Fx => (s) => patchIssue(s, m, (i) => {
  const rows = [...i.rows]; const k = rows.findIndex((r) => r.id === rid); const row = rows[k]!;
  let j = k + dir; while (j >= 0 && j < rows.length && rows[j]!.section !== row.section) j += dir;
  if (j < 0 || j >= rows.length) return i;
  [rows[k], rows[j]] = [rows[j]!, { ...row, isNew: false }];
  return { ...i, rows };
});
export const placeRow = (m: string, rid: string): Fx => (s) => patchIssue(s, m, (i) => ({ ...i, rows: i.rows.map((r) => (r.id === rid ? { ...r, isNew: false } : r)) }));
export const saveRow = (m: string, rid: string, patch: Partial<Row>): Fx => (s) => patchIssue(s, m, (i) => ({ ...i, rows: i.rows.map((r) => (r.id === rid ? { ...r, ...patch } : r)) }));
export const addRow = (m: string, section: Row['section'], title: string, text: string | RichDoc, persistence: Row['persistence']): Fx => (s0) => { const [s, rid] = id(s0, 'row'); return patchIssue(s, m, (i) => ({ ...i, rows: [...i.rows, { id: rid, section, slot: null, persistence, title, body: typeof text !== 'string' ? text : text ? richDocFromText(text) : emptyRichDoc(), quotes: [], pointId: null }] })); };
export const removeRow = (m: string, rid: string): Fx => (s) => patchIssue(s, m, (i) => ({ ...i, rows: i.rows.filter((r) => r.id !== rid || r.slot) }));
export const planSkip = (s: State, m: string, date: CalDate): ReturnType<typeof planNextMeeting> => planNextMeeting(slotsOf(s), slotsOf(s).find((x) => toIsoDate(x.monday) === m)!, date, { rule: ruleOf(s), now: new Date(s.now) });
export const setSkipped = (m: string, date: CalDate): Fx => (s0) => {
  const r = planSkip(s0, m, date); if (!r.ok) return s0;
  const heldM = toIsoDate(slotMondayOf(date));
  let s = ensureIssue(s0, m); s = ensureIssue(s, heldM);
  for (const x of r.plan.skipped as readonly { monday: CalDate }[]) { const k = toIsoDate(x.monday); s = ensureIssue(s, k); s = patchIssue(s, k, (i) => ({ ...i, status: 'skipped' })); }
  if (r.plan.moved) s = patchIssue(s, heldM, (i) => ({ ...i, meetingDate: toIsoDate(date), deadlineAt: r.plan.held.deadlineAt.toISOString() }));
  // What was prepared for a skipped porada goes to the next one held: annexes, one-off points, people, paragraphs.
  for (const x of r.plan.skipped as readonly { monday: CalDate }[]) {
    const k = toIsoDate(x.monday); if (k === heldM) continue; const from = issueOf(s, k)!;
    s = patchIssue(s, heldM, (i) => ({ ...i, annexes: [...i.annexes, ...from.annexes.filter((a) => !i.annexes.some((b) => b.id === a.id))], rows: [...i.rows, ...from.rows.filter((a) => !i.rows.some((b) => b.id === a.id))], present: from.present || i.present, guests: from.guests || i.guests, placeholders: { ...from.placeholders, ...i.placeholders } }));
    s = patchIssue(s, k, (i) => ({ ...i, annexes: [] }));
  }
  // Points of a skipped porada go to the next one held.
  const gone = new Set(r.plan.skipped.map((x: { monday: CalDate }) => toIsoDate(x.monday)));
  s = { ...s, points: s.points.map((p) => (p.handInMonday && gone.has(p.handInMonday) ? { ...p, handInMonday: heldM } : p)) };
  return audit(s, `Porada ${m}: ${r.plan.skipped.length ? 'nekoná se' : 'přesunuta'}`);
};
export const unskip = (m: string): Fx => (s) => (s.issues.some((i) => i.status === 'generated' && i.monday > m) ? s : patchIssue(s, m, (i) => ({ ...i, status: 'open' })));
export const generate = (m: string): Fx => (s) => {
  if (me(s)?.role !== 'headmaster' || preflight(s, m).some((c) => c.level === 'block')) return s;
  const built = buildDoc(s, m); if (!built.model) return s;
  const missed = new Set(built.segments.filter((x) => x.kind === 'missing').map((x) => x.refId));
  const closed = s.points.filter((p) => p.akceId && missed.has(p.akceId) && ['draft', 'returned', 'submitted'].includes(p.state)).map((p) => p.id);
  const rowsHere = issueOf(s, m)!.rows.map((r) => r.pointId);
  // A report with no akce behind it that nobody decided waits for the next porada, it is never lost.
  const nextM = toIsoDate(slotsOf(s).find((x) => x.status === 'open' && toIsoDate(x.monday) > m)?.monday ?? addDays(parseIsoDate(m), 7));
  const moved = s.points.filter((p) => !p.akceId && p.kind === 'report' && p.handInMonday === m && p.state !== 'approved' && p.state !== 'published' && p.state !== 'rejected' && p.state !== 'withdrawn');
  const left = { moved: moved.map((p) => p.content.title), missed: built.segments.filter((x) => x.kind === 'missing').map((x) => s.futures.find((f) => f.id === x.refId)?.title ?? '') };
  return audit({ ...s,
    issues: s.issues.map((i) => (i.monday === m ? { ...i, status: 'generated', doc: { at: s.now, by: s.userId!, pdf: 'rendering', model: built.model, points: built.points, left } } : i)),
    points: s.points.map((p) => {
      if (moved.some((x) => x.id === p.id)) return { ...p, handInMonday: nextM };
      if (closed.includes(p.id)) return { ...p, state: 'withdrawn' as const, trail: [...p.trail, { at: s.now, who: 'system', what: 'Uzavřeno generováním' }] };
      if (p.state === 'approved' && (p.handInMonday === m || rowsHere.includes(p.id))) return { ...p, state: 'published' as const, trail: [...p.trail, { at: s.now, who: 'system', what: 'Zveřejněno v poradě' }] };
      return p;
    }),
    futures: s.futures.map((f) => (missed.has(f.id) ? { ...f, report: 'missed' as const } : f)),
    registry: s.registry.map((l) => ({ ...l, entries: l.entries.map((e) => ({ ...e, isNew: false })) })),
  }, `Vygenerováno: ${m}`);
};
export const finishPdf = (m: string, ok = true): Fx => (s) => patchIssue(s, m, (i) => (i.doc ? { ...i, doc: { ...i.doc, pdf: ok ? 'ready' : 'failed', ...(ok ? {} : { pdfFailure: 'convert' }) } } : i));

// ---- registry, types, settings, access ----
export const addList = (name: string, docLabel: string): Fx => (s0) => { const [s, k] = id(s0, 'list'); return { ...s, registry: [...s.registry, { key: k, purpose: 'point4', docLabel, name, archived: false, entries: [] }] }; };
export const renameList = (key: string, name: string, docLabel: string): Fx => (s) => ({ ...s, registry: s.registry.map((l) => (l.key === key ? { ...l, name, docLabel } : l)) });
export const addEntries = (key: string, rows: { givenName: string; familyName: string; classCode: string }[]): Fx => (s0) => { let s = s0; for (const r of rows) { const [n, e] = id(s, 'e'); s = { ...n, registry: n.registry.map((l) => (l.key === key ? { ...l, entries: [...l.entries, { id: e, ...r, isNew: true }] } : l)) }; } return s; };
export const editEntry = (key: string, e: string, v: { givenName: string; familyName: string; classCode: string }, _version: number): Fx => (s) => ({ ...s, registry: s.registry.map((l) => (l.key === key ? { ...l, entries: l.entries.map((x) => (x.id === e ? { ...x, ...v } : x)) } : l)) });
export const removeEntry = (key: string, e: string): Fx => (s) => ({ ...s, registry: s.registry.map((l) => (l.key === key ? { ...l, entries: l.entries.filter((x) => x.id !== e) } : l)) });
export const newSchoolYear = (keys: string[]): Fx => (s) => audit({ ...s, registry: s.registry.map((l) => (keys.includes(l.key) ? { ...l, entries: l.entries.filter((e) => !e.isNew).map((e) => e) , archived: l.purpose !== 'annex1' } : l)) }, 'Nový školní rok');
export { parsePaste };
export const saveType = (tid: string | null, patch: Partial<PointType>): Fx => (s0) => { if (tid) return { ...s0, types: s0.types.map((t) => (t.id === tid ? { ...t, ...patch } : t)) }; const [s, n] = id(s0, 'type'); return { ...s, types: [...s.types, { id: n, name: 'Nový typ', titleGender: 'f', bullets: [{ key: 'participants', label: 'Účastníci', kind: 'people', required: true }], locked: false, active: true, ...patch }] }; };
export const saveSettings = (patch: Partial<State['settings']>): Fx => (s) => { const n = { ...s, settings: { ...s.settings, ...patch } }; const today = Date.parse(s.now); return { ...n, issues: n.issues.map((i) => (i.status === 'open' && Date.parse(i.deadlineAt) > today + 14 * 864e5 ? { ...i, deadlineAt: deadline(parseIsoDate(i.meetingDate), { dayOffset: n.settings.dayOffset, time: parseWallTime(n.settings.time) }).toISOString() } : i)) }; };
export const requestAccess = (reason: string): Fx => (s0) => { const u = me(s0)!; const [s, rid] = id(s0, 'req'); const r: AccessReq = { id: rid, name: nameOf(u), email: u.email, reason, at: s.now, state: 'pending', userId: u.id }; return { ...s, requests: [...s.requests, r] }; };
export const cancelRequest = (rid: string): Fx => (s) => ({ ...s, requests: up(s.requests, rid, (r) => ({ ...r, state: 'cancelled' })) });
export const decideRequest = (rid: string, to: 'approved' | 'rejected' | 'blocked'): Fx => (s0) => {
  const r = s0.requests.find((x) => x.id === rid)!;
  let s: State = { ...s0, requests: up(s0.requests, rid, (x) => ({ ...x, state: to, decidedAt: s0.now })) };
  if (to === 'approved') { const ex = s.users.find((u) => u.email === r.email); if (ex) s = { ...s, users: up(s.users, ex.id, (u) => ({ ...u, role: 'submitter' })) }; else { const [n, uid] = id(s, 'u'); const [givenName = '', familyName = ''] = r.name.split(' '); s = { ...n, users: [...n.users, { id: uid, salutation: 'pan', givenName, familyName, email: r.email, role: 'submitter', isStudent: false, status: 'active', job: 'Učitel' }] }; } }
  const ex = s.users.find((u) => u.email === r.email);
  return ex ? mail(s, ex.id, 'Přístup do Autoporady', to === 'approved' ? 'Přístup byl schválen.' : 'Přístup nebyl schválen.') : s;
};
export const setUser = (uid: string, patch: { role?: Role; status?: 'active' | 'blocked'; isStudent?: boolean }): Fx => (s) => {
  if (uid === s.userId || needsReauth(s)) return s;
  return audit({ ...s, users: up(s.users, uid, (u) => { const n = { ...u, ...patch }; return n.isStudent && (n.role === 'reviewer' || n.role === 'headmaster') ? { ...n, role: 'submitter' } : n; }) }, `Změna uživatele ${uid}`);
};
export { pointOfAkce };
