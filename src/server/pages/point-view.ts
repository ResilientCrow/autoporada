import type { z } from 'zod';

import type { getPointOutput } from '@/contracts';
import { formatLongDate, formatTime, schoolYear, type Campus } from '@/domain/cs';
import type { PointKind } from '@/domain/report';
import type { PointState } from '@/domain/review';
import { parseIsoDate, parseWallTime, type CalDate } from '@/domain/time';

/** `points.get` as the use case answers. */
export type LoadedPoint = z.output<typeof getPointOutput>;

/**
 * What the read view prints below the facts: the content for the preview's composition, the school
 * year the paper counts from (the Monday the point was first submitted for, else today's) and the
 * timeline, newest first, naming no one.
 */
interface PointReadModel<C> {
  readonly content: C;
  readonly schoolYear: string;
  readonly timeline: readonly {
    readonly event: LoadedPoint['timeline'][number]['event'];
    readonly note: string | null;
    readonly editedFields: readonly string[] | null;
    /** ISO instant. */
    readonly createdAt: string;
  }[];
}

/**
 * A point as its page's header, facts and read view show it, dates and times written out: the
 * author's page (/body/[id]) and the reviewer's (/kontrola/[id]) alike.
 */
export interface PointViewModel<C = LoadedPoint['content']> {
  readonly id: string;
  readonly kind: PointKind;
  readonly state: PointState;
  /** Empty while the author has not named the point. */
  readonly title: string;
  /** A report's type; null for finance and pokyn. */
  readonly typeName: string | null;
  /** The version the page shows, for the forms that move the point. */
  readonly version: number;
  readonly facts: {
    readonly eventDate: string | null;
    readonly endDate: string | null;
    readonly timeFrom: string | null;
    readonly timeTo: string | null;
    readonly campus: Campus | null;
    readonly place: string | null;
  };
  readonly read: PointReadModel<C>;
}

const dateText = (iso: string | null) => (iso === null ? null : formatLongDate(parseIsoDate(iso)));
const timeText = (iso: string | null) => (iso === null ? null : formatTime(parseWallTime(iso)));

/** The header, facts and read view of a loaded point, as of the Prague day `today`. */
export function pointView(
  { id, kind, state, type, content, version, earliestMonday, timeline }: LoadedPoint,
  today: CalDate,
): PointViewModel {
  return {
    id,
    kind,
    state,
    version,
    title: content.title,
    typeName: type?.name ?? null,
    facts: {
      eventDate: dateText(content.eventDate),
      endDate: dateText(content.endDate),
      timeFrom: timeText(content.timeFrom),
      timeTo: timeText(content.timeTo),
      campus: content.campus,
      place: content.place?.trim() || null,
    },
    read: {
      content,
      schoolYear: schoolYear(earliestMonday === null ? today : parseIsoDate(earliestMonday)),
      timeline: timeline.map(({ event, note, editedFields, createdAt }) => ({
        event,
        note,
        editedFields,
        createdAt,
      })),
    },
  };
}
