/**
 * The Arch actions, unchanged for the screen (they still update the state at once), each tagged
 * with what the real app must do: `toCalls` turns the tag into use-case calls at send time, with
 * the ids and versions the server knows by then.
 */
import { contentWire } from '@/contracts/point';
import { toIsoDate, toIsoTime } from '@/domain/time';
import { emptyRichDoc, type RichDoc } from '@/domain/richtext';
import type { CalDate } from '@/domain/time';
import * as S from './store';
import type { Future, PointKind, Role, Row, State } from './types';

export * from './store';

type Fx = ((s: State) => State) & { op?: Op };
export type Op = { k: string; a: unknown[]; tmp?: string; d?: number; m?: string };
const tag = (f: (s: State) => State, op: Op): Fx => Object.assign((s: State) => f(s), { op });

export interface Call { name: string; input: unknown; tmp?: string; key?: string }
const issueRows = (s: State, m: string) => s.issues.find((i) => i.monday === m)?.rows ?? [];
const rowIndex = (s: State, m: string, rid: string) => { const rows = issueRows(s, m); const r = rows.find((x) => x.id === rid); return rows.filter((x) => x.section === r?.section).findIndex((x) => x.id === rid); };
export interface Ctx { s: State; vers: Record<string, number>; real: (id: string) => string }

const SEED_TYPES: Record<string, string> = { seminar: 'Seminář', exkurze: 'Exkurze', soutez: 'Soutěž', prednaska: 'Přednáška', projektovy: 'Projektový den', jine: 'Jiné' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const realType = (s: State, typeId: string | null) => {
  if (!typeId || UUID.test(typeId)) return typeId;
  const name = SEED_TYPES[typeId] ?? 'Jiné';
  return s.types.find((t) => t.name === name)?.id ?? s.types.find((t) => t.name === 'Jiné')?.id ?? s.types[0]?.id ?? null;
};

// ---- the actions the screens call ----
export const createPoint = (kind: PointKind, typeId: string | null, akceId: string | null, onId?: (id: string) => void): Fx => {
  const op: Op = { k: 'createPoint', a: [kind, typeId, akceId] };
  return tag((s) => { const t = realType(s, typeId); op.a = [kind, t, akceId]; return S.createPoint(kind, t, akceId, (id) => { op.tmp = id; onId?.(id); })(s); }, op);
};
export const createFuture = (kind: Future['kind'], onId?: (id: string) => void): Fx => {
  const op: Op = { k: 'createFuture', a: [kind] };
  return tag(S.createFuture(kind, (id) => { op.tmp = id; onId?.(id); }), op);
};
export const addAnnex = (m: string, onId?: (id: string) => void): Fx => tag(S.addAnnex(m, onId), { k: 'annexes', a: [m] });
export const addRow = (m: string, section: Row['section'], title: string, text: string | RichDoc, persistence: Row['persistence']): Fx => {
  const op: Op = { k: 'addRow', a: [m, section, title, text, persistence] };
  return tag((s) => { const n = S.addRow(m, section, title, text, persistence)(s); const before = new Set(issueRows(s, m).map((r) => r.id)); op.tmp = issueRows(n, m).find((r) => !before.has(r.id))?.id; return n; }, op);
};
/** A move is a run of one-step moves on the server: as many as the row moved here. */
const moved = (k: string, m: string, rid: string, f: (s: State) => State): Fx => {
  const op: Op = { k, a: [m, rid] };
  return tag((s) => { const n = f(s); op.d = rowIndex(n, m, rid) - rowIndex(s, m, rid); return n; }, op);
};
export const moveRow = (m: string, rid: string, dir: -1 | 1): Fx => moved('moveRow', m, rid, S.moveRow(m, rid, dir));
export const placeRowAfter = (m: string, rid: string, afterId: string): Fx => moved('moveRow', m, rid, S.placeRowAfter(m, rid, afterId));

const simple = <A extends unknown[]>(k: string, f: (...a: A) => (s: State) => State) => (...a: A): Fx => tag(f(...a), { k, a });
export const savePoint = simple('savePoint', S.savePoint);
export const submitPoint = simple('submitPoint', S.submitPoint);
export const retractPoint = simple('retractPoint', S.retractPoint);
export const withdrawPoint = simple('withdrawPoint', S.withdrawPoint);
export const approvePoint = simple('approvePoint', S.approvePoint);
export const returnPoint = simple('returnPoint', S.returnPoint);
export const rejectPoint = simple('rejectPoint', S.rejectPoint);
export const editAsReviewer = simple('editAsReviewer', S.editAsReviewer);
export const saveFuture = simple('saveFuture', S.saveFuture);
export const submitFuture = simple('submitFuture', S.submitFuture);
export const retractFuture = simple('retractFuture', S.retractFuture);
export const withdrawFuture = simple('withdrawFuture', S.withdrawFuture);
export const reviseFuture = simple('reviseFuture', S.reviseFuture);
export const approveFuture = simple('approveFuture', S.approveFuture);
export const returnFuture = simple('returnFuture', S.returnFuture);
export const rejectFuture = simple('rejectFuture', S.rejectFuture);
export const cancelFuture = simple('cancelFuture', S.cancelFuture);
export const saveIssueTexts = simple('saveIssueTexts', S.saveIssueTexts);
export const setAnnex2 = simple('setAnnex2', S.setAnnex2);
export const saveAnnex = simple('annexes', S.saveAnnex);
export const removeAnnex = simple('annexes', S.removeAnnex);
export const moveAnnex = simple('annexes', S.moveAnnex);
export const setPlaceholder = simple('setPlaceholder', S.setPlaceholder);
export const placeRow = simple('placeRow', S.placeRow);
export const saveRow = simple('saveRow', S.saveRow);
export const removeRow = simple('removeRow', S.removeRow);
export const setSkipped = simple('setSkipped', S.setSkipped);
export const unskip = simple('unskip', S.unskip);
export const generate = simple('generate', S.generate);
export const addList = simple('addList', S.addList);
export const renameList = simple('renameList', S.renameList);
export const addEntries = simple('addEntries', S.addEntries);
export const removeEntry = simple('removeEntry', S.removeEntry);
export const newSchoolYear = simple('newSchoolYear', S.newSchoolYear);
export const saveType = simple('saveType', S.saveType);
export const saveSettings = simple('saveSettings', S.saveSettings);
export const requestAccess = simple('requestAccess', S.requestAccess);
export const cancelRequest = simple('cancelRequest', S.cancelRequest);
export const decideRequest = simple('decideRequest', S.decideRequest);
export const setUser = simple('setUser', S.setUser);
/** A draft's type or kind; the real app fixes them at the create, the bridge lets the author change a draft's. */
export const retype = (id: string, patch: { typeId?: string; kind?: PointKind }): Fx => tag((s) => ({ ...s, points: s.points.map((x) => (x.id === id ? { ...x, ...patch } : x)) }), { k: 'retype', a: [id, patch] });
/** The session lives at the server: these leave the app for its sign-out and step-up. */
export const signOut: Fx = tag((s) => s, { k: 'signOut', a: [] });
export const signOutAll: Fx = tag((s) => s, { k: 'signOut', a: ['all'] });
export const stepUp: Fx = tag((s) => s, { k: 'stepUp', a: [] });
export const signIn = (_id: string): Fx => tag((s) => s, { k: 'none', a: [] });
/** The worker renders the PDF; the screen only waits for it. */
export const finishPdf = (_m: string, _ok = true): Fx => tag((s) => s, { k: 'none', a: [] });

// ---- what each tag asks of the server ----
const wireDate = (d: CalDate | null) => (d ? toIsoDate(d) : null);
const futureWire = (f: Future) => ({
  title: f.title,
  startDate: f.dateSet === false ? null : wireDate(f.date),
  endDate: wireDate(f.endDate),
  timeFrom: f.timeFrom ? toIsoTime(f.timeFrom) : null,
  timeTo: f.timeTo ? toIsoTime(f.timeTo) : null,
  campus: f.campus,
  place: f.place.trim() ? f.place : null,
  responsible: f.responsible.people.length || f.responsible.behalfOf ? f.responsible : null,
});
const uuid = () => crypto.randomUUID();

export function toCalls(op: Op, { s, vers, real }: Ctx): Call[] {
  const a = op.a as never[];
  const pt = (id: string) => s.points.find((p) => p.id === id || real(p.id) === real(id));
  const fu = (id: string) => s.futures.find((f) => f.id === id || real(f.id) === real(id));
  const pw = (id: string) => ({ id: real(id), expectedVersion: vers[real(id)] ?? 1 });
  const issueV = (m: string) => (vers[`issue:${m}`] ? { expectedVersion: vers[`issue:${m}`] } : {});
  const decidePoint = (event: string, note?: string): Call[] => [{ name: 'points.decide', key: real(a[0]), input: { ...pw(a[0]), event, ...(note ? { note } : {}) } }];
  const decideFuture = (event: string, note?: string): Call[] => [{ name: 'future.decide', key: real(a[0]), input: { ...pw(a[0]), event, ...(note ? { note } : {}) } }];
  const content = (id: string) => contentWire(pt(id)!.content);
  switch (op.k) {
    case 'createPoint': {
      const [kind, typeId, akceId] = a as unknown as [PointKind, string | null, string | null];
      if (akceId) return [{ name: 'future.startReport', tmp: op.tmp!, input: { id: real(akceId), typeId } }];
      return [{ name: 'points.create', tmp: op.tmp!, input: { clientRef: uuid(), kind, typeId: kind === 'report' ? typeId : null } }];
    }
    case 'savePoint': return pt(a[0]) ? [{ name: 'points.save', key: real(a[0]), input: { ...pw(a[0]), content: content(a[0]) } }] : [];
    case 'submitPoint': return [{ name: 'points.submit', key: real(a[0]), input: { ...pw(a[0]), content: content(a[0]) } }];
    case 'retractPoint': return [{ name: 'points.retract', key: real(a[0]), input: pw(a[0]) }];
    case 'withdrawPoint': return [{ name: 'points.withdraw', key: real(a[0]), input: { ...pw(a[0]), confirmed: true } }];
    case 'approvePoint': return decidePoint('approve');
    case 'returnPoint': return decidePoint('return', a[1]);
    case 'rejectPoint': return decidePoint('reject', a[1]);
    case 'editAsReviewer': return [{ name: 'points.reviewEdit', key: real(a[0]), input: { ...pw(a[0]), content: content(a[0]) } }];
    case 'createFuture': return [{ name: 'future.create', tmp: op.tmp!, input: { clientRef: uuid(), kind: a[0] } }];
    case 'saveFuture': return fu(a[0]) ? [{ name: 'future.save', key: real(a[0]), input: { ...pw(a[0]), content: futureWire(fu(a[0])!) } }] : [];
    case 'reviseFuture': return [{ name: 'future.save', key: real(a[0]), input: { ...pw(a[0]), content: futureWire(fu(a[0])!), intent: 'revise' } }];
    case 'submitFuture': return [{ name: 'future.submit', key: real(a[0]), input: { ...pw(a[0]), content: futureWire(fu(a[0])!) } }];
    case 'retractFuture':
    case 'withdrawFuture': return [{ name: 'future.retract', key: real(a[0]), input: pw(a[0]) }];
    case 'approveFuture': return decideFuture('approve');
    case 'returnFuture': return decideFuture('return', a[1]);
    case 'rejectFuture': return decideFuture('reject', a[1]);
    case 'cancelFuture': return [{ name: 'future.cancel', key: real(a[0]), input: { ...pw(a[0]), confirmed: true } }];
    case 'saveIssueTexts': return [{ name: 'issues.setDetails', key: `issue:${a[0]}`, input: { monday: a[0], ...issueV(a[0]), present: a[1], guests: a[2] } }];
    case 'setAnnex2': return [{ name: 'issues.setAnnex2', key: `issue:${a[0]}`, input: { monday: a[0], ...issueV(a[0]), body: a[1] ?? emptyRichDoc() } }];
    case 'annexes': { const m = a[0] as string; return [{ name: 'arch.annexes', input: { monday: m, annexes: s.issues.find((i) => i.monday === m)?.annexes ?? [] } }]; }
    case 'setPlaceholder': return [{ name: 'issues.setPlaceholder', key: `ph:${real(a[1])}`, input: { monday: a[0], itemId: real(a[1]), paragraph: a[2], expectedVersion: vers[`ph:${real(a[1])}`] ?? 0 } }];
    case 'addRow': {
      const [m, section, title, text, persistence] = a as unknown as [string, string, string, string | RichDoc, string];
      const row = issueRows(s, m).find((r) => r.id === op.tmp);
      const lineageId = uuid();
      void text;
      return [{ name: 'outline.add', key: `issue:${m}`, tmp: op.tmp!, input: { monday: m, ...issueV(m), lineageId, section, title, persistence, ...(row && { body: row.body }) } }];
    }
    case 'moveRow': {
      const [m, rid] = a as unknown as [string, string];
      const n = Math.abs(op.d ?? 0); const direction = (op.d ?? 0) < 0 ? 'up' : 'down';
      return Array.from({ length: n }, () => ({ name: 'outline.move', key: `issue:${m}`, input: { monday: m, lineageId: real(rid), direction } }));
    }
    case 'placeRow': {
      // A move places the rows it swaps, and a schválený návrh cannot be saved; up and back leaves it where it is.
      const [m, rid] = a as unknown as [string, string]; const r = issueRows(s, m).find((x) => x.id === rid);
      const same = issueRows(s, m).filter((x) => x.section === r?.section);
      if (same.length < 2) return [];
      const dirs = same[0]?.id === rid ? ['down', 'up'] : ['up', 'down'];
      return dirs.map((direction) => ({ name: 'outline.move', key: `issue:${m}`, input: { monday: m, lineageId: real(rid), direction } }));
    }
    case 'saveRow': {
      const [m, rid, patch] = a as unknown as [string, string, Partial<Row>];
      return [{ name: 'outline.save', key: `issue:${m}`, input: { monday: m, ...issueV(m), lineageId: real(rid), ...(patch.title !== undefined && { title: patch.title }), ...(patch.body && { body: patch.body }), ...(patch.quotes && { quotes: patch.quotes }), ...(patch.persistence && { persistence: patch.persistence }) } }];
    }
    case 'removeRow': return [{ name: 'outline.remove', key: `issue:${a[0]}`, input: { monday: a[0], ...issueV(a[0]), lineageId: real(a[1]) } }];
    case 'setSkipped': return [{ name: 'issues.setSkipped', key: `issue:${a[0]}`, input: { monday: a[0], event: 'skip', ...issueV(a[0]), confirmed: true, nextMeeting: toIsoDate(a[1]) } }];
    case 'unskip': return [{ name: 'issues.setSkipped', key: `issue:${a[0]}`, input: { monday: a[0], event: 'unskip', ...issueV(a[0]), confirmed: true } }];
    case 'generate': return [{ name: 'issues.generate', key: `issue:${a[0]}`, input: { monday: a[0], ...issueV(a[0]), confirmed: true } }];
    case 'addList': return [{ name: 'registry.saveList', input: { title: a[0], docLabel: a[1], active: true } }];
    case 'renameList': { const l = s.registry.find((x) => x.key === a[0]) as { id?: string } | undefined; return l?.id ? [{ name: 'registry.saveList', key: l.id, input: { id: l.id, version: vers[l.id] ?? 1, title: a[1], docLabel: a[2], active: true } }] : []; }
    case 'addEntries': { const l = s.registry.find((x) => x.key === a[0]) as { id?: string } | undefined; return l?.id ? [{ name: 'registry.addEntries', input: { listId: l.id, rows: a[1] } }] : []; }
    case 'removeEntry': return UUID.test(a[1]) ? [{ name: 'registry.removeEntry', input: { id: a[1] } }] : [];
    case 'newSchoolYear': {
      const ids = (a[0] as string[]).map((k) => (s.registry.find((x) => x.key === k) as { id?: string } | undefined)?.id).filter(Boolean);
      const y = new Date(s.now).getFullYear(); const m = new Date(s.now).getMonth();
      const year = m >= 8 ? `${y}/${y + 1}` : `${y - 1}/${y}`;
      return ids.length ? [{ name: 'registry.newSchoolYear', input: { listIds: ids, year, confirmed: true } }] : [];
    }
    case 'saveType': {
      const [tid, patch] = a as unknown as [string | null, Record<string, unknown>];
      const t = tid ? s.types.find((x) => x.id === tid) : s.types.at(-1);
      if (!t) return [];
      const base = { name: t.name, titleGender: t.titleGender, defaultBullets: t.bullets, active: t.active, ...('name' in patch ? {} : {}) };
      return [{ name: 'pointTypes.save', ...(tid && { key: tid }), input: tid ? { id: tid, expectedVersion: vers[tid] ?? 1, ...base } : base }];
    }
    case 'saveSettings': {
      const p = a[0] as Partial<State['settings']>; const st = s.settings; const out: Call[] = [];
      if ('dayOffset' in p || 'time' in p) out.push({ name: 'settings.save', key: 'settings:deadline', input: { key: 'deadline', value: { dayOffset: st.dayOffset, time: st.time }, version: vers['settings:deadline'] ?? 0 } });
      if ('remindSoft' in p || 'remindHard' in p) out.push({ name: 'settings.save', key: 'settings:reminders', input: { key: 'reminders', value: { soft: st.remindSoft, hard: st.remindHard }, version: vers['settings:reminders'] ?? 0 } });
      if ('annex1Heading' in p || 'annex1Intro' in p) out.push({ name: 'settings.save', key: 'settings:texts.annex1', input: { key: 'texts.annex1', value: { heading: st.annex1Heading, intro: st.annex1Intro }, version: vers['settings:texts.annex1'] ?? 0 } });
      return out;
    }
    case 'retype': return [{ name: 'arch.retype', key: real(a[0]), input: { ...pw(a[0]), ...(a[1] as object) } }];
    case 'requestAccess': return [{ name: 'access.request', input: { reason: a[0] } }];
    case 'cancelRequest': return [{ name: 'access.cancel', input: { requestId: a[0], version: vers[a[0]] ?? 1 } }];
    case 'decideRequest': {
      const [rid, to] = a as unknown as [string, 'approved' | 'rejected' | 'blocked'];
      const r = s.requests.find((x) => x.id === rid); const u = s.users.find((x) => x.id === r?.userId);
      const decision = to === 'approved' ? (u?.isStudent ? 'approve-student' : 'approve-staff') : to === 'rejected' ? 'reject' : 'block';
      return [{ name: 'access.decide', input: { requestId: rid, version: vers[rid] ?? 1, decision, confirmed: true } }];
    }
    case 'setUser': {
      const [uid] = a as unknown as [string, { role?: Role }];
      const u = s.users.find((x) => x.id === uid); if (!u) return [];
      return [{ name: 'users.changeAccess', key: uid, input: { userId: uid, version: vers[uid] ?? 1, role: u.role, audience: u.isStudent ? 'student' : 'staff', status: u.status, confirmed: true } }];
    }
    default: return [];
  }
}
