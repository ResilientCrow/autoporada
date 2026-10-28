import type { ReviewDecision } from '@/domain/review';
import type { TemplateName } from '@/notify';

/** Which mail each review decision sends the point's author (ADR 0020). The opt-out does not cover them. */
export const POINT_MAIL = {
  approve: 'point.approved',
  return: 'point.returned',
  reject: 'point.rejected',
} as const satisfies Readonly<Record<ReviewDecision, TemplateName>>;

/** What `points.decide` knows when it enqueues: the author, and the event it just appended. */
export interface PointMailIds {
  readonly authorId: string;
  readonly eventId: string;
}

/**
 * The author hears of the event, keyed by it: a point returned twice is
 * mailed twice, once per return.
 */
export const pointMailParts = ({ authorId, eventId }: PointMailIds) => ({
  recipientId: authorId,
  subjectId: eventId,
  key: eventId,
});
