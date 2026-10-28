import type { z } from 'zod';

import { getPoint, queuePoints } from '@/application/use-cases';
import type { queuePointsOutput } from '@/contracts';
import type { Actor } from '@/domain/actor';
import { can } from '@/domain/policy';
import type { PointEvent } from '@/domain/review';
import { instantToWallClock } from '@/domain/time';

import { getContainer } from '../container';
import { runRegistered } from '../pipeline';

import { orNotFound } from './not-found';
import { pointView, type LoadedPoint, type PointViewModel } from './point-view';
import { getViewer, requestId } from './viewer';

/** „Kontrola“: the queue as `points.queue` answers; the page writes the dates out. */
export type QueuePageModel = z.output<typeof queuePointsOutput>;

/** A reviewer's decision on a point, in the order the bar offers them. */
type ReviewDecision = Extract<PointEvent, 'approve' | 'return' | 'reject'>;
const DECISIONS: readonly ReviewDecision[] = ['approve', 'return', 'reject'];

/** What the decision bar may offer this viewer, worked out here so the page only renders it. */
interface ReviewBarModel {
  /** The decisions the policy allows from the point's state (separation of duties included). */
  readonly decisions: readonly ReviewDecision[];
  /** „Upravit“: a reviewer's edit, never on their own point (SSU-6). */
  readonly canEdit: boolean;
}

/** /kontrola/[id]: the point as its read view shows it, and the bar's choices. */
export interface ReviewPointPageModel extends PointViewModel {
  readonly bar: ReviewBarModel;
}

/** The queue, or null for a visitor or a viewer who may not review (404). */
export async function queuePage(): Promise<QueuePageModel | null> {
  const viewer = await getViewer();
  if (!viewer) return null;
  return orNotFound(
    'points.queue',
    await runRegistered(getContainer(), queuePoints, {
      principal: viewer,
      requestId: await requestId(),
      input: {},
    }),
  );
}

/** The bar's choices for this actor; `points.get` names no author, only whether it is the viewer. */
function barOf(actor: Actor, { state, isAuthor }: LoadedPoint): ReviewBarModel {
  const point = { state, isAuthor };
  return {
    decisions: DECISIONS.filter((event) =>
      can(actor, { action: 'point.transition', point, event }),
    ),
    canEdit: !isAuthor && can(actor, { action: 'point.edit', point }),
  };
}

/**
 * One point under review, or null for a visitor, a viewer who may not review, or a refusal of the
 * point, a malformed id and an unknown or foreign point included (404).
 */
export async function reviewPointPage(id: string): Promise<ReviewPointPageModel | null> {
  const viewer = await getViewer();
  if (!viewer || !can(viewer.actor, { action: 'review.queue' })) return null;
  const loaded = orNotFound(
    'points.get',
    await runRegistered(getContainer(), getPoint, {
      principal: viewer,
      requestId: await requestId(),
      input: { id },
    }),
  );
  if (loaded === null) return null;
  const today = instantToWallClock(getContainer().app.clock.now()).date;
  return { ...pointView(loaded, today), bar: barOf(viewer.actor, loaded) };
}
