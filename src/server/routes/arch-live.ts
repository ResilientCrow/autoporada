/**
 * Branch arch-ui only: the live working set of the state endpoint. The viewer's scope (the policy)
 * decides what may be seen; this is a second, narrower filter on what is sent, so the state does
 * not grow with the history. `src/infra/db/arch.ts` keeps a superset of it in its WHERE.
 */
import type { FutureItemRecord, PointRecord } from '@/application/ports';
import type { FutureState, PointState } from '@/domain/review';
import { toIsoDate } from '@/domain/time';

/** The last generated porada: its Monday and its meeting date, as ISO dates. */
export interface LastPorada {
  readonly monday: string;
  readonly meetingDate: string;
}

/** States in which a colleague's point is in review or waiting to be printed. */
const POINT_IN_FLIGHT: ReadonlySet<PointState> = new Set(['submitted', 'returned', 'approved']);
/** States in which a colleague's future item still needs the vedení's attention. */
const FUTURE_IN_FLIGHT: ReadonlySet<FutureState> = new Set(['submitted', 'returned']);

/**
 * Whether a point belongs to the viewer's working set: not withdrawn, and the viewer's own, or in
 * review or approved, or a refused report of a live akce (the client reads it to see that the akce
 * is closed), or nothing is generated yet. Another author's published or refused point is history.
 */
export function isLivePoint(
  p: { authorId: string; state: PointState; akceId: string | null },
  viewerId: string,
  last: LastPorada | null,
  liveAkceIds: ReadonlySet<string>,
): boolean {
  if (p.state === 'withdrawn') return false;
  return (
    p.authorId === viewerId ||
    POINT_IN_FLIGHT.has(p.state) ||
    last === null ||
    (p.state === 'rejected' && p.akceId !== null && liveAkceIds.has(p.akceId))
  );
}

/**
 * The day from which an item with nothing open is still live: the earlier of today and the last
 * generated porada's meeting date (a porada is generated before it is held, so an akce not over
 * today stays live until the meeting); null before the first generated porada.
 */
export function liveSince(last: LastPorada | null, today: string): string | null {
  return last === null ? null : today < last.meetingDate ? today : last.meetingDate;
}

/**
 * Whether a future item belongs to the viewer's working set: not withdrawn, and the viewer's own,
 * or waiting for a decision, or approved with a cancel request, or not over before `since` (see
 * `liveSince`), or nothing is generated yet (`since` is null).
 */
export function isLiveFuture(
  f: {
    authorId: string;
    state: FutureState;
    cancelRequestedAt: Date | null;
    /** The last day (`endDate`, else `startDate`) as an ISO date; null without a date. */
    lastDay: string | null;
  },
  viewerId: string,
  since: string | null,
): boolean {
  if (f.state === 'withdrawn') return false;
  return (
    f.authorId === viewerId ||
    FUTURE_IN_FLIGHT.has(f.state) ||
    (f.state === 'approved' && f.cancelRequestedAt !== null) ||
    since === null ||
    (f.lastDay !== null && f.lastDay >= since)
  );
}

/** The last generated porada of the stored rows (any order), or null before the first. */
export function lastGeneratedOf(
  rows: readonly { monday: string; meetingDate: string; status: string }[],
): LastPorada | null {
  const last = rows
    .filter((r) => r.status === 'generated')
    .reduce<(typeof rows)[number] | null>((a, r) => (a && a.monday > r.monday ? a : r), null);
  return last && { monday: last.monday, meetingDate: last.meetingDate };
}

/** The points of `rows` that are live for the viewer; `liveAkceIds` are the ids of the live future items. */
export function livePoints(
  rows: readonly PointRecord[],
  viewerId: string,
  last: LastPorada | null,
  liveAkceIds: ReadonlySet<string>,
): PointRecord[] {
  return rows.filter((p) =>
    isLivePoint(
      { authorId: p.authorId, state: p.state, akceId: p.futureItemId },
      viewerId,
      last,
      liveAkceIds,
    ),
  );
}

/** The future items of `rows` that are live for the viewer from `since` (see `liveSince`). */
export function liveFutures(
  rows: readonly FutureItemRecord[],
  viewerId: string,
  since: string | null,
): FutureItemRecord[] {
  return rows.filter((f) => {
    const lastDay = f.content.endDate ?? f.content.startDate;
    return isLiveFuture(
      {
        authorId: f.authorId,
        state: f.state,
        cancelRequestedAt: f.cancelRequestedAt,
        lastDay: lastDay ? toIsoDate(lastDay) : null,
      },
      viewerId,
      since,
    );
  });
}
