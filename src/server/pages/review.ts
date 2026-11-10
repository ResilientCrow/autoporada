import type { z } from 'zod';

import { getPoint, queueFuture, queuePoints } from '@/application/use-cases';
import type { queueFutureOutput, queuePointsOutput } from '@/contracts';
import type { Actor } from '@/domain/actor';
import type { TitleGender } from '@/domain/cs';
import type { RecentPerson } from '@/domain/people';
import { can } from '@/domain/policy';
import type { BulletSpec, PointKind } from '@/domain/report';
import { REVIEW_DECISIONS, type ReviewDecision } from '@/domain/review';
import { instantToWallClock, type CalDate } from '@/domain/time';

import { getContainer } from '../container';
import { runPage } from './run-page';

import { orNotFound } from './not-found';
import { pointView, type LoadedPoint, type PointViewModel } from './point-view';
import { recentsOf } from './recents';
import { getViewer, requestId } from './viewer';

/** „Schválení bodů“: the queue as `points.queue` answers; the page writes the dates out. */
export type QueuePageModel = z.output<typeof queuePointsOutput>;

/** „Schválení budoucích akcí“: the handed-in akce and jednání as `future.queue` answers. */
export type FutureQueuePageModel = z.output<typeof queueFutureOutput>;

/** What the decision bar may offer this viewer, worked out here so the page only renders it. */
interface ReviewBarModel {
  /** The decisions the policy allows from the point's state (separation of duties included). */
  readonly decisions: readonly ReviewDecision[];
  /** „Upravit“: a reviewer's edit, never on their own point (SSU-6). */
  readonly canEdit: boolean;
  /**
   * The viewer may not approve only because the point is their own: the bar says another reviewer
   * or the headmaster approves it (separation of duties).
   */
  readonly othersApprove: boolean;
}

/**
 * What the reviewer's editor (design section 10) starts from: the content as the edit sends it
 * back, the point's kind (a report's fields, or a proposal's title and text), the type's bullets
 * and title gender, the Prague day the picker counts classes from, the people the reviewer named
 * lately (none are read for a proposal, which names no one) and whether the school directory is
 * searched at all.
 */
interface ReviewEditModel {
  readonly content: LoadedPoint['content'];
  readonly kind: PointKind;
  readonly spec: readonly BulletSpec[];
  readonly titleGender: TitleGender | null;
  readonly typeName: string | null;
  readonly today: CalDate;
  readonly recents: readonly RecentPerson[];
  readonly directory: 'on' | 'off';
}

/** /kontrola/[id]: the point as its read view shows it, the bar's choices and the editor's start. */
export interface ReviewPointPageModel extends PointViewModel {
  readonly bar: ReviewBarModel;
  /** Only when the viewer may edit the point („Upravit“); null otherwise, the recent people unread. */
  readonly edit: ReviewEditModel | null;
}

/** The points queue, or null for a visitor or a viewer who may not review (404). */
export async function queuePage(): Promise<QueuePageModel | null> {
  const viewer = await getViewer();
  if (!viewer) return null;
  const ask = { principal: viewer, requestId: await requestId(), input: {} };
  return orNotFound('points.queue', await runPage(queuePoints, ask));
}

/** The akce and jednání queue, or null for a visitor or a viewer who may not review (404). */
export async function futureQueuePage(): Promise<FutureQueuePageModel | null> {
  const viewer = await getViewer();
  if (!viewer) return null;
  const ask = { principal: viewer, requestId: await requestId(), input: {} };
  return orNotFound('future.queue', await runPage(queueFuture, ask));
}

/** The bar's choices for this actor; `points.get` names no author, only whether it is the viewer. */
function barOf(actor: Actor, { state, isAuthor }: LoadedPoint): ReviewBarModel {
  const point = { state, isAuthor };
  const decisions = REVIEW_DECISIONS.filter((event) =>
    can(actor, { action: 'point.transition', point, event }),
  );
  const approvableByOthers = can(actor, {
    action: 'point.transition',
    point: { state, isAuthor: false },
    event: 'approve',
  });
  return {
    decisions,
    canEdit: !isAuthor && can(actor, { action: 'point.edit', point }),
    othersApprove: !decisions.includes('approve') && approvableByOthers,
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
    await runPage(getPoint, {
      principal: viewer,
      requestId: await requestId(),
      input: { id },
    }),
  );
  if (loaded === null) return null;
  const today = instantToWallClock(getContainer().app.clock.now()).date;
  const bar = barOf(viewer.actor, loaded);
  const edit = bar.canEdit
    ? {
        content: loaded.content,
        kind: loaded.kind,
        spec: loaded.type?.defaultBullets ?? [],
        titleGender: loaded.type?.titleGender ?? null,
        typeName: loaded.type?.name ?? null,
        today,
        recents: loaded.kind === 'report' ? await recentsOf(viewer) : [],
        directory: getContainer().directoryMode,
      }
    : null;
  return { ...pointView(loaded, today), bar, edit };
}
