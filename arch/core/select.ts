import { calendarBoundary, eventEnd, issueSlots, owedPorada, reportCloses, workingSlot, deadline, type DeadlineRule, type IssueSlot } from '@/domain/calendar';
import { formatClose, formatDayMonth, formatWeekdayNumeric, onWeekday, placeholderParagraph, schoolYear, weekdayName } from '@/domain/cs';
import { missingForSubmit, pointType, type BulletSpec, type DraftPerson } from '@/domain/report';
import { recentPeople } from '@/domain/people';
import { isRichDocEmpty, richDocFromText, singleLine } from '@/domain/richtext';
import { addDays, compareDates, instantToWallClock, parseIsoDate, parseWallTime, toIsoDate, type CalDate } from '@/domain/time';
import { composeDocument, reportFromContent } from '@/document/compose';
import type { Block, DocumentModel } from '@/document/model';
import { parseIssueSnapshot, type IssueSnapshot } from '@/snapshot';
import { FUTURE_RETURN_PARTS, pointReturnPartsFor } from '@/domain/review';
import { future as futureCopy } from '@/ui/copy/future';
import { points as pointCopy } from '@/ui/copy/points';
import type { Future, Issue, Point, Role, State, User } from './types';

const nowOf = (s: State) => new Date(s.now);
/** The parts a return may name (ADR 0058), as [code, label] in the order the form asks them: a report's four, a proposal's title and text, an akce's or jednání's four. */
export const returnPartsOf = (it: Point | Future): (readonly [string, string])[] =>
  'content' in it ? pointReturnPartsFor(it.kind).map((c) => [c, pointCopy.timeline.part(c, it.kind) ?? c] as const) : FUTURE_RETURN_PARTS.map((c) => [c, futureCopy.returnPart[c]] as const);
/** The labels of the parts a return named, in the form's order. */
export const partLabels = (it: Point | Future, parts: readonly string[] | null | undefined) => returnPartsOf(it).filter(([c]) => parts?.includes(c)).map(([, l]) => l);
/** The older Příloha 2 (one text, carried from porada to porada) prints before the further annexes, as `composeDocument` numbers them. */
export const hasAnnex2 = (iss: Issue) => !!iss.annex2 && !isRichDocEmpty(iss.annex2);
export const firstExtraAnnex = (iss: Issue) => (hasAnnex2(iss) ? 3 : 2);
export const todayOf = (s: State): CalDate => instantToWallClock(nowOf(s)).date;
export const me = (s: State): User | null => s.users.find((u) => u.id === s.userId) ?? null;
export const userById = (s: State, id: string) => s.users.find((u) => u.id === id);
export const nameOf = (u?: User | null) => (u ? `${u.givenName} ${u.familyName}`.trim() : '');
/** Czech count: 1 bod, 2 body, 5 bodů, 0 bodů. */
export const counts = (n: number, a: string, b: string, c: string) => (n === 1 ? `1 ${a}` : n >= 2 && n <= 4 ? `${n} ${b}` : `${n} ${c}`);
/** The verb agrees too: „Zbývá 1 znak“, „Zbývají 2 znaky“, „Zbývá 5 znaků“. */
export const charsLeft = (n: number) => `${n >= 2 && n <= 4 ? 'Zbývají' : 'Zbývá'} ${counts(n, 'znak', 'znaky', 'znaků')}.`;
export const atLeast = (r: Role | undefined, m: Role) => { const o: Role[] = ['pending', 'submitter', 'reviewer', 'headmaster']; return r ? o.indexOf(r) >= o.indexOf(m) : false; };
export const ruleOf = (s: State): DeadlineRule => ({ dayOffset: s.settings.dayOffset, time: parseWallTime(s.settings.time) });
export const yearOf = (s: State) => schoolYear(todayOf(s));
/** The signed-in user as a person of a report, with their class or job for this school year. */
export const mePerson = (s: State): DraftPerson => { const u = me(s)!; return { salutation: u.salutation, givenName: u.givenName, familyName: u.familyName, ...(u.affiliation && { affiliation: u.affiliation, affiliationYear: yearOf(s) }) }; };

const row = (i: Issue) => ({ monday: parseIsoDate(i.monday), meetingDate: parseIsoDate(i.meetingDate), deadlineAt: new Date(i.deadlineAt), status: i.status });
const rowsOf = (s: State) => s.issues.map(row);
/** The calendar's boundary (ADR 0054): up to it a Monday with no row is no porada. */
export const plannedOf = (s: State): CalDate => calendarBoundary(s.plannedThrough ? parseIsoDate(s.plannedThrough) : null, todayOf(s));
export const slotsOf = (s: State): IssueSlot[] => [...issueSlots(rowsOf(s), todayOf(s), ruleOf(s), plannedOf(s))];
export const issueOf = (s: State, monday: string) => s.issues.find((i) => i.monday === monday);
/** The porada the school works on: first open with a meeting today or later. */
export function working(s: State): IssueSlot { return workingSlot(todayOf(s), slotsOf(s)) ?? slotsOf(s)[0]!; }
export const workingMonday = (s: State) => toIsoDate(working(s).monday);
/** Where a new point goes when handed in now: the next open porada whose deadline is ahead. */
export function handInTo(s: State): IssueSlot {
  const n = nowOf(s).getTime();
  return slotsOf(s).find((x) => x.status === 'open' && x.deadlineAt.getTime() > n)!;
}
export const clock = (at: string | Date) => { const c = formatClose(typeof at === 'string' ? new Date(at) : at); return { ...c, day: formatDayMonth(c.date), weekday: weekdayName(c.date), full: `${formatWeekdayNumeric(c.date)} v ${c.time}` }; };
export const dm = (x: string | CalDate) => formatDayMonth(typeof x === 'string' ? parseIsoDate(x) : x);
/** The day a porada meets and its uzávěrka, apart, so a line never names the uzávěrka as the porada's date: „ve středu 18. 11.“, „v pondělí 16. 11. v 20:00“. */
export function poradaDates(slot: Pick<IssueSlot, 'meetingDate' | 'deadlineAt'>, now: Date) {
  const c = clock(slot.deadlineAt);
  return { meets: `${onWeekday(slot.meetingDate)} ${dm(slot.meetingDate)}`, close: `${onWeekday(c.date)} ${c.day} v ${c.time}`, closed: slot.deadlineAt.getTime() <= now.getTime() };
}
export function untilText(s: State, at: string | Date): string {
  const ms = new Date(at).getTime() - nowOf(s).getTime();
  if (ms <= 0) return 'termín minul';
  const h = Math.floor(ms / 3.6e6), dd = Math.floor(h / 24);
  const dw = dd === 1 ? '1 den' : dd < 5 ? `${dd} dny` : `${dd} dní`;
  const hw = (x: number) => (x === 1 ? '1 hodinu' : x < 5 ? `${x} hodiny` : `${x} hodin`);
  return dd > 0 ? `${dw} a ${hw(h % 24)}` : h > 0 ? hw(h) : `${Math.max(1, Math.floor(ms / 6e4))} min`;
}
/** „sobota 7. 11.“ after „do“ or „od“: „soboty 7. 11.“. */
const DAY_GENITIVE: Record<string, string> = { 'středa': 'středy', 'čtvrtek': 'čtvrtka', 'pátek': 'pátku', 'sobota': 'soboty', 'neděle': 'neděle', 'pondělí': 'pondělí', 'úterý': 'úterý' };
export const fromDay = (full: string) => full.replace(/^\S+/, (d) => DAY_GENITIVE[d] ?? d);
/** Why these dates cannot go out, or null. */
export const dateProblem = (s: State, f: Future): string | null => {
  if (f.dateSet === false) return 'Vyberte den.';
  if (compareDates(f.date, todayOf(s)) < 0) return 'Ten den už byl. Vyberte den, který teprve přijde.';
  if (f.endDate && compareDates(f.endDate, f.date) < 0) return 'Poslední den nemůže být dřív než první.';
  return null;
};
/** The parser reads one person a line; people also write „A (3.B), B (3.B)“. */
// ponytail: two capitalised words after a comma count as a new person, so „Jan Novák, Základní škola“ splits; the preview shows it.
export const oneOnLine = (v: string) => v.replace(/[;]\s*/g, '\n').replace(/,\s*(?=\p{Lu}\p{L}+\s+\p{Lu}\p{L}+)/gu, '\n').replace(/^[ \t]*[-\u2013\u2022*]\s*/gm, '');
/** A proposal only, made on request and shown for checking: -ová or a given name in -a reads as a woman. */
export const guessSalutation = (p: { givenName: string; familyName: string; affiliation?: string }): 'pan' | 'pani' | 'slecna' => {
  const woman = /(ová|á)$/i.test(p.familyName) || (/a$/i.test(p.givenName) && !/^(jan|honz|mich|luk|nikol|jir|kub|mis|sas)a$/i.test(p.givenName));
  return !woman ? 'pan' : p.affiliation ? 'slecna' : 'pani';
};
const lastDayOf = (f: Future) => f.endDate ?? f.date;
const futureEnd = (f: Future) => eventEnd({ lastDay: lastDayOf(f), timeTo: f.timeTo });
const ownerIsOver = (s: State, f: Future) => futureEnd(f).getTime() <= nowOf(s).getTime();
export const owedMonday = (s: State, f: Future) => toIsoDate(owedPorada(lastDayOf(f), rowsOf(s), plannedOf(s)));
/** The report an akce started and still has: any but a withdrawn one, so a refused report too (it closes the akce, ADR 0056). */
const pointOfAkce = (s: State, id: string) => s.points.find((p) => p.akceId === id && p.state !== 'withdrawn');
/** Deleting this report brings its akce back to „Čeká na Vás“: only while the report was never handed in. */
export const asksAgain = (s: State, p: Point) => { const f = p.akceId ? s.futures.find((x) => x.id === p.akceId) : undefined; return !!f && (f.report === 'none' || f.report === 'prompted'); };
const closeFor = (s: State, f: Future, monday: string) => {
  const sl = slotsOf(s).find((x) => toIsoDate(x.monday) === monday);
  return sl ? reportCloses(sl, { lastDay: lastDayOf(f), timeTo: f.timeTo }) : deadline(parseIsoDate(monday), ruleOf(s));
};
export interface Owed { akce: Future; point?: Point; monday: string; close: Date; pastClose: boolean; late: boolean }
/** „Akce čekající na zprávu“ (as `future.owedReports`): ended akce of the author, porada still open, its report a draft or returned, or none started while one may be. */
export function owedBy(s: State, userId: string | null): Owed[] {
  const out: Owed[] = [];
  for (const f of s.futures) {
    if (f.kind !== 'akce' || f.state !== 'approved' || f.report === 'missed' || (userId && f.authorId !== userId) || !ownerIsOver(s, f)) continue;
    const monday = owedMonday(s, f);
    const iss = issueOf(s, monday);
    if (iss?.status === 'generated') continue;
    const bound = pointOfAkce(s, f.id);
    const point = bound && (bound.state === 'draft' || bound.state === 'returned') ? bound : undefined;
    if (!point && (bound || (f.report !== 'none' && f.report !== 'prompted'))) continue;
    const close = closeFor(s, f, monday);
    const sl = slotsOf(s).find((x) => toIsoDate(x.monday) === monday);
    out.push({ akce: f, ...(point && { point }), monday, close, pastClose: close.getTime() <= nowOf(s).getTime(), late: sl ? close.getTime() > sl.deadlineAt.getTime() : false });
  }
  return out.sort((a, b) => a.monday.localeCompare(b.monday) || a.close.getTime() - b.close.getTime());
}
/** The akce a porada can owe a report for, as the server's `owedAkce` reads them (ADR 0049): approved, or back in review after an approval; not closed as missed; with a start date. */
const isOwable = (f: Future) => f.kind === 'akce' && f.report !== 'missed' && f.dateSet !== false && (f.state === 'approved' || ((f.state === 'submitted' || f.state === 'returned') && f.wasApproved));
/** As the server's `missingReports`: a report is delivered to this porada when it is published, or approved for it (its porada is this one or an earlier open one); an approved report that waits for a later porada leaves the akce missing here. */
const reportDelivered = (point: Point | undefined, monday: string): boolean =>
  !!point && (point.state === 'published' || (point.state === 'approved' && (point.poradaMonday ?? monday) <= monday));
/** Every akce owed to a porada, with what happened to its report: the headmaster's „Chybějící zprávy“. A refused report closes its akce (ADR 0056). */
export function owedTo(s: State, monday: string) {
  return s.futures.filter((f) => isOwable(f) && owedMonday(s, f) === monday && (ownerIsOver(s, f) || compareDates(lastDayOf(f), parseIsoDate(issueOf(s, monday)?.meetingDate ?? monday)) < 0)).flatMap((f) => {
    const point = pointOfAkce(s, f.id);
    if (point?.state === 'rejected') return [];
    return [{ akce: f, point, delivered: reportDelivered(point, monday), notYetOver: !ownerIsOver(s, f) }];
  });
}
/** The paragraph the system writes for an akce (ADR 0060), whatever the headmaster wrote instead. */
export function systemText(f: Future): string {
  return placeholderParagraph({ date: f.date, ...(f.endDate && { endDate: f.endDate }), ...(f.timeFrom && { from: f.timeFrom }), campus: f.campus, ...(f.place.trim() && { place: singleLine(f.place) }), title: singleLine(f.title), ...(f.organizer.trim() && { organizer: singleLine(f.organizer) }), organizerRole: f.organizerRole, ...(f.participants.trim() && { participants: singleLine(f.participants) }) });
}
export function placeholderText(s: State, f: Future, monday: string): string {
  return issueOf(s, monday)?.placeholders[f.id] || systemText(f);
}
/** Where an akce's missing-report paragraph stands (ADR 0061); as the server's `placeholderStatus`. */
type PlaceholderStatus = 'checked' | 'handed-in' | 'open' | 'to-check';
function placeholderStatusOf(s: State, f: Future, monday: string): PlaceholderStatus {
  const known = s.placeholderChecks[f.id];
  if (known?.checked) return 'checked';
  // The headmaster's state carries the server's status; a local edit drops it, and then the rule is mirrored here.
  if (known?.status && known.status !== 'checked') return known.status;
  if (pointOfAkce(s, f.id)?.state === 'submitted') return 'handed-in';
  return nowOf(s).getTime() < closeFor(s, f, monday).getTime() ? 'open' : 'to-check';
}
export interface PlaceholderItem { akce: Future; monday: string; status: PlaceholderStatus; close: Date; point: Point | undefined }
/** The placeholders of an open porada: one for each akce owed to it whose report is not decided. */
export function placeholdersOf(s: State, monday: string): PlaceholderItem[] {
  if (issueOf(s, monday)?.status === 'generated') return [];
  return owedTo(s, monday).filter((o) => !o.delivered).map((o) => ({ akce: o.akce, monday, status: placeholderStatusOf(s, o.akce, monday), close: closeFor(s, o.akce, monday), point: o.point })).sort((a, b) => compareDates(a.akce.date, b.akce.date));
}
/** One placeholder by its akce, in whatever standing: the detail page opens for any that exists (headmaster only). */
export const placeholderById = (s: State, u: User | null, akceId: string): PlaceholderItem | undefined => (u?.role === 'headmaster' ? slotsOf(s).filter((x) => x.status === 'open').flatMap((x) => placeholdersOf(s, toIsoDate(x.monday))).find((x) => x.akce.id === akceId) : undefined);
/** Ke kontrole: the headmaster's placeholders still to check, over every open porada, by the akce's date. */
export function placeholderQueue(s: State, u: User | null): PlaceholderItem[] {
  if (u?.role !== 'headmaster') return [];
  return slotsOf(s).filter((x) => x.status === 'open').flatMap((x) => placeholdersOf(s, toIsoDate(x.monday))).filter((x) => x.status === 'to-check').sort((a, b) => compareDates(a.akce.date, b.akce.date));
}
export const myPoints = (s: State, id: string) => s.points.filter((p) => p.authorId === id && p.state !== 'withdrawn');
export const myFutures = (s: State, id: string) => s.futures.filter((f) => f.authorId === id && f.state !== 'withdrawn');
export const queuePoints = (s: State) => s.points.filter((p) => p.state === 'submitted').sort((a, b) => (a.submittedAt ?? '').localeCompare(b.submittedAt ?? ''));
export const queueFutures = (s: State) => s.futures.filter((f) => f.state === 'submitted' || (f.state === 'approved' && f.cancelRequested)).sort((a, b) => (a.cancelRequestedAt ?? a.submittedAt ?? '').localeCompare(b.cancelRequestedAt ?? b.submittedAt ?? ''));
export const canDecidePoint = (u: User | null, p: Point) => !!u && (u.role === 'headmaster' || (u.role === 'reviewer' && p.authorId !== u.id));
export const canDecideFuture = (u: User | null, f: Future) => !!u && (u.role === 'headmaster' || (u.role === 'reviewer' && f.authorId !== u.id));
export const pendingRequests = (s: State) => s.requests.filter((r) => r.state === 'pending');
export const upcoming = (s: State) => s.futures.filter((f) => f.state === 'approved' && !ownerIsOver(s, f)).sort((a, b) => compareDates(a.date, b.date));
export const specOf = (p: Point): readonly BulletSpec[] => (p.typeId ? pointType(p.typeId).defaultBullets : []);
export const readiness = (s: State, p: Point) => missingForSubmit(p.kind, p.content, specOf(p), todayOf(s));
export const peopleFor = (s: State, id: string) => recentPeople(myPoints(s, id).map((p) => ({ ...p.content, updatedAt: new Date(p.savedAt) })) as never, 300);

// ---- the document ----
/** The first three pokyny fill themselves from akce and the student list: they keep their place and have nothing to edit. */
const FIXED_SLOTS = new Set(['meetings', 'events', 'talent']);
const isFixedRow = (r: Issue['rows'][number]) => !!r.slot && FIXED_SLOTS.has(r.slot);
/** Rows the document fills by itself; the pokyny page does not list them. */
const AUTO_SLOTS = new Set([...FIXED_SLOTS, 'exemptions']);
export const isAutoRow = (r: Issue['rows'][number]) => !!r.slot && AUTO_SLOTS.has(r.slot);
export interface Segment { key: string; kind: 'head' | 'report' | 'missing' | 'item' | 'tail'; refId?: string; fixed?: true; state?: Point['state'] | 'missing' | 'checked' | 'generated'; blocks: Block[] }
export interface Built { model: DocumentModel | null; errors: string[]; segments: Segment[]; points: number; printed: string[] }

/** The real snapshot of a porada. `extra` adds points not yet decided (preview) or the draft being typed. */
function snapshotOf(s: State, monday: string, opts: { pending?: boolean; draft?: Point | null } = {}) {
  const iss = issueOf(s, monday) ?? s.issues[s.issues.length - 1]!;
  const meeting = parseIsoDate(iss.meetingDate);
  const reports: Record<string, unknown>[] = []; const refs: Record<string, Segment['state']> = {};
  const add = (p: Point, st: Segment['state']) => { const { report } = reportFromContent(p.content, { id: p.id }); if (report) { reports.push(report as never); refs[p.id] = st; } };
  const here = s.points.filter((p) => p.kind === 'report' && p.poradaMonday === monday);
  const shown = new Set<string>();
  for (const p of here) if (p.state === 'approved' || p.state === 'published') { add(p, p.state); shown.add(p.akceId ?? p.id); }
  if (opts.pending) for (const p of here) if (p.state === 'submitted') { add(p, 'submitted'); shown.add(p.akceId ?? p.id); }
  if (opts.draft?.kind === 'report') { reports.splice(reports.findIndex((r) => r['id'] === opts.draft!.id) >>> 0, reports.some((r) => r['id'] === opts.draft!.id) ? 1 : 0); add(opts.draft, 'draft'); if (opts.draft.akceId) shown.add(opts.draft.akceId); }
  for (const o of owedTo(s, monday)) {
    if (shown.has(o.akce.id) || o.notYetOver && !opts.pending) continue;
    reports.push({ id: `missing-${o.akce.id}`, title: o.akce.title, date: toIsoDate(o.akce.date), ...(o.akce.endDate && { endDate: toIsoDate(o.akce.endDate) }), body: richDocFromText(placeholderText(s, o.akce, monday)), bullets: [], statements: [], missing: true });
    refs[`missing-${o.akce.id}`] = s.placeholderChecks[o.akce.id]?.checked ? 'checked' : 'missing';
  }
  const futureItems = s.futures.filter((f) => f.state === 'approved').map(futureSnap);
  const rowOut = (r: Issue['rows'][number]) => {
    const pt = r.pointId ? s.points.find((p) => p.id === r.pointId) : null;
    return pt ? { title: pt.content.title, slot: null, body: pt.content.body, quotes: [] } : { title: r.title, slot: r.slot, body: r.body, quotes: r.quotes };
  };
  const eligible = (r: Issue['rows'][number]) => { if (!r.pointId) return true; const pt = s.points.find((p) => p.id === r.pointId); return pt?.state === 'approved' || pt?.state === 'published'; };
  const raw = {
    schema: 2, issue: { id: `issue-${monday}`, monday, meetingDate: iss.meetingDate, schoolYear: schoolYear(meeting) },
    presentText: iss.present, guestsText: iss.guests,
    pokyny: iss.rows.filter((r) => r.section === 'pokyny' && eligible(r)).map(rowOut), hospodareni: iss.rows.filter((r) => r.section === 'hospodareni' && eligible(r)).map(rowOut),
    reports, futureItems, registry: s.registry.filter((l) => !l.archived).map((l) => ({ key: l.key, purpose: l.purpose, docLabel: l.docLabel, entries: l.entries.map(({ givenName, familyName, classCode, isNew }) => ({ givenName, familyName, classCode, isNew })) })),
    annex1: { heading: s.settings.annex1Heading, intro: s.settings.annex1Intro }, annex2: iss.annex2, annexes: iss.annexes.map((a) => ({ title: a.title, parts: a.parts.map((p) => (p.kind === 'text' ? { kind: p.kind, doc: p.doc } : p.kind === 'table' ? { kind: p.kind, rows: p.rows } : { kind: p.kind, src: p.src, w: p.w, h: p.h, alt: p.alt })) })), options: {},
  };
  return { raw, refs, parsed: parseIssueSnapshot(raw) };
}
function segmentize(model: DocumentModel, snap: IssueSnapshot, refs: Record<string, Segment['state']>, rows: Issue['rows']): Segment[] {
  const out: Segment[] = []; let cur: Segment = { key: 'head', kind: 'head', blocks: [] };
  const norm = (x: string) => x.replace(/\s+/g, ' ').trim().toLowerCase();
  const reports = [...snap.reports]; let n = 0;
  for (const sec of model.sections) for (const [i, b] of sec.blocks.entries()) {
    // Word starts such a section on a new page; the preview shows the same break, as before Příloha 1.
    if (i === 0 && sec.layout === 'nextPage') cur.blocks.push({ kind: 'pageBreak' });
    if (b.kind === 'point') {
      out.push(cur); n++;
      const i = reports.findIndex((r) => norm(r.title) === norm(b.text));
      if (i >= 0) { const r = reports.splice(i, 1)[0]!; cur = { key: r.id, kind: r.missing ? 'missing' : 'report', refId: r.id.replace(/^missing-/, ''), state: refs[r.id], blocks: [b] }; }
      else { const row = rows.find((x) => norm(b.text).startsWith(norm(x.title))); cur = { key: `n${n}`, kind: 'item', ...(row && { refId: row.id }), ...(row && isFixedRow(row) && { fixed: true as const }), blocks: [b] }; }
    } else if (b.kind === 'closing' || b.kind === 'annex') { out.push(cur); cur = { key: `t${out.length}`, kind: 'tail', blocks: [b] }; }
    else if (b.kind === 'section' && cur.kind !== 'head') { out.push(cur); cur = { key: `s${out.length}`, kind: 'head', blocks: [b] }; }
    else cur.blocks.push(b);
  }
  out.push(cur); return out.filter((x) => x.blocks.length);
}
const isoO = (x: Future) => ({ date: toIsoDate(x.date), ...(x.endDate && { endDate: toIsoDate(x.endDate) }), ...(x.timeFrom && { timeFrom: `${x.timeFrom.hour}:${String(x.timeFrom.minute).padStart(2, '0')}` }), ...(x.timeTo && x.timeFrom && { timeTo: `${x.timeTo.hour}:${String(x.timeTo.minute).padStart(2, '0')}` }) });
/** The akce as the document's composer reads it. */
export const futureSnap = (f: Future) => ({
    id: f.id, kind: f.kind, title: f.title, ...isoO(f), ...(f.campus && { campus: f.campus }), ...(f.place && { place: f.place }),
    ...(f.organizer.trim() && { organizer: singleLine(f.organizer), ...(f.organizerRole && { organizerRole: f.organizerRole }) }), ...(f.participants.trim() && { participants: singleLine(f.participants) }), ...(f.remark.trim() && { note: singleLine(f.remark) }),
});
// ponytail: last few builds only; every action makes new state, so this just spares repeats within one render.
const buildCache: { k: unknown[]; v: Built }[] = [];
export function buildDoc(s: State, monday: string, opts: { pending?: boolean; draft?: Point | null } = {}): Built {
  const k = [s.points, s.futures, s.issues, s.registry, s.settings, s.now, monday, !!opts.pending, opts.draft ?? null];
  const hit = buildCache.find((x) => x.k.every((y, i) => y === k[i]));
  if (hit) return hit.v;
  const v = buildDocNow(s, monday, opts);
  buildCache.unshift({ k, v }); buildCache.length = Math.min(buildCache.length, 6);
  return v;
}
function buildDocNow(s: State, monday: string, opts: { pending?: boolean; draft?: Point | null }): Built {
  const iss = issueOf(s, monday);
  const { refs, parsed } = snapshotOf(s, monday, opts);
  if (!parsed.ok) return { model: null, errors: [...parsed.errors], segments: [], points: 0, printed: [] };
  const model = composeDocument(parsed.snapshot);
  const segments = segmentize(model, parsed.snapshot, refs, iss?.rows ?? []);
  return { model, errors: [], segments, points: model.sections.flatMap((x) => x.blocks).filter((b) => b.kind === 'point').length, printed: parsed.snapshot.reports.map((r) => r.id) };
}
// ---- preflight ----
export type Check = { level: 'block' | 'warn' | 'ok'; code: string; text: string; to?: string; n?: number };
export function preflight(s: State, monday: string): Check[] {
  const iss = issueOf(s, monday); const c: Check[] = [];
  if (!iss) return c;
  const earlier = slotsOf(s).find((x) => x.status === 'open' && toIsoDate(x.monday) < monday);
  if (earlier) c.push({ level: 'block', code: 'earlier-open', text: `Nejdřív je potřeba uzavřít poradu ${dm(earlier.monday)}: vygenerovat ji, nebo ji zrušit, když se nekoná.`, to: toIsoDate(earlier.monday) });
  const built = buildDoc(s, monday);
  if (built.errors.length) c.push({ level: 'block', code: 'invalid', text: 'Dokument teď nejde sestavit. Zkontrolujte přítomné a pokyny.' });
  const here = s.points.filter((p) => p.poradaMonday === monday && p.kind === 'report');
  const wait = here.filter((p) => p.state === 'submitted').length, ret = here.filter((p) => p.state === 'returned').length;
  const waitA = s.futures.filter((f) => f.state === 'submitted' && f.kind === 'akce').length, waitJ = s.futures.filter((f) => f.state === 'submitted' && f.kind !== 'akce').length, akce = waitA + waitJ;
  // Czech agreement: 1 and 5+ take a singular verb, 2 to 4 and a pair of kinds a plural one.
  const waitWho = [waitA ? `${waitA} ${waitA < 5 ? 'akce' : 'akcí'}` : '', waitJ ? `${waitJ} jednání` : ''].filter(Boolean).join(' a '), waitVerb = waitA && waitJ ? 'čekají' : akce === 1 || akce >= 5 ? 'čeká' : 'čekají';
  if (wait) c.push({ level: 'warn', code: 'waiting', n: wait, text: `${wait === 1 ? '1 zpráva čeká' : wait < 5 ? `${wait} zprávy čekají` : `${wait} zpráv čeká`} na kontrolu. Bez schválení nevyjde.`, to: 'kontrola' });
  if (akce) c.push({ level: 'warn', code: 'akce-waiting', n: akce, text: `${waitWho} ${waitVerb} na kontrolu.`, to: 'kontrola' });
  if (ret) c.push({ level: 'warn', code: 'returned', n: ret, text: `${ret === 1 ? '1 zpráva je vrácená' : `${ret} vrácené zprávy`} autorovi. Bez schválení nevyjde.` });
  const miss = owedTo(s, monday).filter((o) => !o.delivered && !o.notYetOver);
  if (miss.length) c.push({ level: 'warn', code: 'reports-missing', n: miss.length, text: `${miss.length === 1 ? 'Z 1 akce chybí zpráva' : `Ze ${miss.length} akcí chybí zpráva`}. Vytiskne se jen odstavec o akci.`, to: 'zpravy' });
  const unchecked = placeholdersOf(s, monday).filter((h) => h.status !== 'checked').length;
  if (unchecked) c.push({ level: 'warn', code: 'placeholders-unchecked', n: unchecked, text: 'Odstavce za nedodané zprávy nejsou zkontrolované. Vyjdou tak, jak je napsal systém.', to: 'zpravy' });
  const late = owedTo(s, monday).filter((o) => o.notYetOver);
  if (late.length) c.push({ level: 'warn', code: 'late-expected', n: late.length, text: `Ještě se čeká na pozdní zprávu: ${late.slice(0, 3).map((x) => x.akce.title).join(', ')}${late.length > 3 ? ` a ${late.length - 3} dalších` : ''}.` });
  const orphan = iss.rows.filter((r) => r.pointId && !['approved', 'published'].includes(s.points.find((p) => p.id === r.pointId)?.state ?? ''));
  if (orphan.length) c.push({ level: 'warn', code: 'proposal-gone', n: orphan.length, text: 'Zařazený návrh už není schválený, do dokumentu nepůjde.', to: 'pokyny' });
  const unplaced = iss.rows.filter((r) => r.isNew);
  if (unplaced.length) c.push({ level: 'warn', code: 'unplaced', n: unplaced.length, text: `Nově schválený návrh zatím stojí na konci sekce: ${unplaced.map((r) => s.points.find((p) => p.id === r.pointId)?.content.title ?? r.title).join(', ')}.`, to: 'pokyny' });
  const talent = s.registry.find((l) => l.purpose === 'annex1' && !l.archived);
  if (!talent?.entries.length) c.push({ level: 'warn', code: 'annex1-empty', text: 'Příloha 1 je prázdná.', to: 'seznamy' }); else c.push({ level: 'ok', code: 'annex1', text: 'Příloha 1 je vyplněná.' });
  if (new Date(iss.deadlineAt).getTime() > nowOf(s).getTime()) c.push({ level: 'warn', code: 'deadline-ahead', text: `Uzávěrka je za ${untilText(s, iss.deadlineAt)}. Po vygenerování už nikdo nic nepřidá.` });
  if (!iss.present.trim()) c.push({ level: 'warn', code: 'present-empty', text: 'Přítomní nejsou vyplnění.', to: 'udaje' });
  return c;
}
/** A saved document, grouped for the same sheet and rejstřík as a live one. */
export function builtOfModel(model: DocumentModel): Built {
  const segments = segmentize(model, { reports: [] } as unknown as IssueSnapshot, {}, []);
  return { model, errors: [], segments, points: segments.filter((x) => x.kind === 'item').length, printed: [] };
}
export interface OutlineItem { key: string; n?: number; title: string; kind: Segment['kind']; state?: Segment['state']; group: string; refId?: string }
const GROUP: Record<string, string> = { 'POKYNY': 'Pokyny', 'INFORMACE Z HOSPODAŘENÍ': 'Hospodaření', 'INFORMACE Z PROVOZU': 'Provoz školy' };
/** Every point and annex of the document, in order, under its big section. */
export function outlineOf(b: Built): OutlineItem[] {
  const out: OutlineItem[] = []; let group = '';
  for (const seg of b.segments) {
    const sec = seg.blocks.find((x) => x.kind === 'section');
    if (sec && sec.kind === 'section') group = Object.entries(GROUP).find(([k]) => sec.text.startsWith(k))?.[1] ?? sec.text;
    const pt = seg.blocks.find((x) => x.kind === 'point');
    if (pt && pt.kind === 'point') { out.push({ key: seg.key, n: pt.number, title: pt.text, kind: seg.kind, state: seg.state, group, ...(seg.refId && { refId: seg.refId }) }); continue; }
    const an = seg.blocks.find((x) => x.kind === 'annex');
    if (an && an.kind === 'annex') { const t = seg.blocks.find((x) => x.kind === 'annexTitle'); const name = an.text.replace('PŘÍLOHA', 'Příloha'); out.push({ key: seg.key, title: t && t.kind === 'annexTitle' ? `${name}: ${t.text}` : name, kind: 'tail', group: 'Přílohy' }); }
  }
  return out;
}
/** About how long it prints: measured on the rendered DOCX, about 650 words a page, each annex starts a new one. */
export function pagesOf(b: Built): number {
  const text = (x: Block): string => { switch (x.kind) { case 'body': case 'bullet': case 'rich': return x.runs.map((r) => r.text).join(' '); case 'reportLine': case 'dash': return `${x.label} ${x.runs.map((r) => r.text).join(' ')}`; case 'partner': return `${x.label} ${x.quote}`; case 'point': case 'section': case 'title': case 'annex': case 'annexTitle': return x.text; case 'label': return `${x.label} ${x.text}`; case 'dataTable': return x.rows.flat().join(' '); case 'studentTable': return x.rows.map((r) => r.name).join(' '); case 'closing': case 'image': case 'pageBreak': case 'spacer': return ''; } };
  const blocks = b.segments.flatMap((x) => x.blocks);
  const words = blocks.reduce((n, x) => n + text(x).split(/\s+/).filter(Boolean).length, 0);
  const pics = blocks.reduce((n, x) => n + (x.kind === 'image' ? 0.4 : 0), 0);
  return Math.max(1, Math.round(words / 650 + pics + blocks.filter((x) => x.kind === 'annex').length * 0.5));
}
export const pagesText = (n: number) => (n === 1 ? 'asi 1 strana' : n < 5 ? `asi ${n} strany` : `asi ${n} stran`);
export const cap = (t: string) => t.charAt(0).toLocaleUpperCase('cs') + t.slice(1);
export { addDays, toIsoDate };
