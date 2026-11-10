/** Branch arch-ui only: points and future items as Arch shows them, with their trail. */
import type { IssueRow } from '@/domain/calendar';
import { toIsoDate, type CalDate } from '@/domain/time';

import type { WebContainer } from '../container';
import { poradaMondayOf } from './arch-calendar';
import { flatBefore, iso, WHAT } from './arch-people';

type Store = WebContainer['arch'];
type Rows<K extends keyof Store> = Awaited<ReturnType<Store[K]>>;

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
      before?: unknown;
    }[],
  ) =>
    evs
      .filter((e) => WHAT[e.event])
      .map((e) => ({
        at: e.createdAt.toISOString(),
        who: !e.actorId ? 'system' : staff || e.actorId === viewerId ? e.actorId : 'vedeni',
        what: WHAT[e.event],
        ...(e.note && { note: e.note }),
        ...(e.event === 'edit' && e.before ? { original: flatBefore(e.before) } : {}),
      }));
  const noteOf = (evs: { event: string; note: string | null }[], state: string) =>
    state === 'returned' || state === 'rejected'
      ? (evs.filter((e) => e.event === 'return' || e.event === 'reject').at(-1)?.note ?? null)
      : null;

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
      savedAt: p.updatedAt.toISOString(),
      trail: trailOf(evs),
    };
  });
  const archFutures = futureRows.map((f) => {
    vers[f.id] = f.version;
    const evs = fEvents.filter((e) => e.futureItemId === f.id);
    const ct = f.content;
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
      responsible: ct.responsible ?? { verb: 'organizuje', people: [] },
      state: f.state,
      changed: evs.some((e) => e.event === 'revise'),
      note: noteOf(evs, f.state),
      report: f.reportState,
      submittedAt: iso(f.submittedAt),
      savedAt: f.updatedAt.toISOString(),
      trail: trailOf(evs),
    };
  });
  return { archPoints, archFutures };
}
