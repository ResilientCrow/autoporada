/** Branch arch-ui only: points and future items as Arch shows them, with their trail. */
import type { IssueRow } from '@/domain/calendar';
import { wasApproved } from '@/domain/review';
import { toIsoDate, type CalDate } from '@/domain/time';

import type { WebContainer } from '../container';
import { poradaMondayOf } from './arch-calendar';
import { flatBefore, iso, WHAT } from './arch-people';

type Store = WebContainer['arch'];
type Rows<K extends keyof Store> = Awaited<ReturnType<Store[K]>>;

/** A cancel request and what became of it (ADR 0062): the author's and the vedení's business. */
const CANCEL_REQUEST_EVENTS: ReadonlySet<string> = new Set([
  'request-cancel',
  'refuse-cancel',
  'retract-cancel',
]);

export function archItems({
  pointRows,
  futureRows,
  pEvents,
  fEvents,
  vers,
  today,
  poradas,
  viewerId,
  staff,
}: {
  pointRows: Rows<'points'>;
  futureRows: Rows<'futures'>;
  pEvents: Rows<'pointEvents'>;
  fEvents: Rows<'futureEvents'>;
  /** The versions the writes must send back; filled here. */
  vers: Record<string, number>;
  today: CalDate;
  /** The calendar's poradas, stored and virtual, in Monday order (`poradaMondayOf`). */
  poradas: readonly Pick<IssueRow, 'monday' | 'status'>[];
  viewerId: string;
  /** May see which member of the vedení acted; an author sees „Vedení“ (as `points.get`). */
  staff: boolean;
}) {
  const trailOf = (
    evs: {
      event: string;
      actorId: string | null;
      createdAt: Date;
      note: string | null;
      returnParts: string[] | null;
      before?: unknown;
    }[],
    involved = true,
  ) =>
    evs
      .filter((e) => WHAT[e.event] && (involved || !CANCEL_REQUEST_EVENTS.has(e.event)))
      .map((e) => ({
        at: e.createdAt.toISOString(),
        who: !e.actorId ? 'system' : staff || e.actorId === viewerId ? e.actorId : 'vedeni',
        what: WHAT[e.event],
        // The vedení's notes, the parts to rework and the edited text are for the author only.
        ...(involved && e.note && { note: e.note }),
        ...(involved && e.returnParts && { parts: e.returnParts }),
        ...(involved && e.event === 'edit' && e.before ? { original: flatBefore(e.before) } : {}),
      }));
  const decisionOf = <T extends { event: string }>(evs: T[], state: string) =>
    state === 'returned' || state === 'rejected'
      ? evs.filter((e) => e.event === 'return' || e.event === 'reject').at(-1)
      : undefined;
  const noteOf = (evs: { event: string; note: string | null }[], state: string) =>
    decisionOf(evs, state)?.note ?? null;
  /** The parts the latest return named, while the item stands returned; else null. */
  const partsOf = (evs: { event: string; returnParts: string[] | null }[], state: string) =>
    state === 'returned' ? (decisionOf(evs, state)?.returnParts ?? null) : null;

  /**
   * The note of the vedení's refusal of a cancel request (ADR 0062), while the akce stands
   * approved and the refusal is the latest thing that happened to it; else null.
   */
  const refusalOf = (evs: { event: string; note: string | null }[], state: string) => {
    const latest = evs.at(-1);
    return state === 'approved' && latest?.event === 'refuse-cancel' ? latest.note : null;
  };

  const akceOfPoint = new Map(
    futureRows.filter((f) => f.reportPointId).map((f) => [f.reportPointId!, f.id]),
  );
  const archPoints = pointRows.map((p) => {
    vers[p.id] = p.version;
    const evs = pEvents.filter((e) => e.pointId === p.id);
    return {
      id: p.id,
      kind: p.kind,
      typeId: p.typeId,
      authorId: p.authorId,
      akceId: p.futureItemId ?? akceOfPoint.get(p.id) ?? null,
      content: p.content,
      state: p.state,
      handInMonday: p.handInMonday ? toIsoDate(p.handInMonday) : null,
      poradaMonday: p.handInMonday
        ? toIsoDate(poradaMondayOf(p.handInMonday, p.state === 'published', poradas))
        : null,
      submittedAt: iso(p.submittedAt),
      note: noteOf(evs, p.state),
      parts: partsOf(evs, p.state),
      savedAt: p.updatedAt.toISOString(),
      trail: trailOf(evs),
    };
  });
  const archFutures = futureRows.map((f) => {
    vers[f.id] = f.version;
    const evs = fEvents.filter((e) => e.futureItemId === f.id);
    const ct = f.content;
    // A cancel request is the author's and the vedení's business, as in `future.get`.
    const involved = staff || f.authorId === viewerId;
    return {
      id: f.id,
      kind: f.kind,
      authorId: f.authorId,
      title: ct.title,
      date: ct.startDate ?? today,
      dateSet: ct.startDate !== null,
      endDate: ct.endDate,
      timeFrom: ct.timeFrom,
      timeTo: ct.timeTo,
      campus: ct.campus,
      place: ct.place ?? '',
      organizer: ct.organizer ?? '',
      participants: ct.participants ?? '',
      remark: ct.note ?? '',
      state: f.state,
      changed: evs.some((e) => e.event === 'revise'),
      wasApproved: wasApproved(evs),
      note: noteOf(evs, f.state),
      parts: partsOf(evs, f.state),
      cancelRequested: involved && f.cancelRequestedAt !== null,
      cancelRequestedAt: involved ? iso(f.cancelRequestedAt) : null,
      cancelRefusal: involved ? refusalOf(evs, f.state) : null,
      report: f.reportState,
      submittedAt: iso(f.submittedAt),
      savedAt: f.updatedAt.toISOString(),
      trail: trailOf(evs, involved),
    };
  });
  return { archPoints, archFutures };
}
