import { atLeast, type Actor, type Role } from '@/domain/actor';
import type { FutureKind } from '@/domain/calendar';
import {
  availableEvents,
  canEditFuture,
  canEditPoint,
  FUTURE_MACHINE,
  POINT_MACHINE,
  REPORT_MACHINE,
  type FutureEvent,
  type FutureState,
  type PointEvent,
  type PointState,
  type ReviewActor,
} from '@/domain/review';

interface Owned {
  readonly authorId: string;
}
/**
 * Who wrote the resource an edit or a transition acts on: its author, or only whether that is the
 * actor (a read model that names no author). Viewing always needs the author.
 */
type Owner = Owned | { readonly isAuthor: boolean };
type PointRef = Owner & { readonly state: PointState };
type FutureRef = Owner & { readonly state: FutureState; readonly kind: FutureKind };
/** `everSubmitted`: handed in and not taken back by a retract (`submitted_at` is set). */
type Seen<S> = Owned & { readonly state: S; readonly everSubmitted: boolean };
type PointView = Seen<PointState>;
type FutureView = Seen<FutureState> & { readonly kind: FutureKind };

/** Everything the app can be asked to do, with the resource it is done to. */
export type Check =
  | { readonly action: 'access.request' }
  | { readonly action: 'profile.manage' }
  | { readonly action: 'directory.search' }
  | { readonly action: 'point.create' }
  | { readonly action: 'point.view'; readonly point: PointView }
  | { readonly action: 'point.edit'; readonly point: PointRef }
  | { readonly action: 'point.transition'; readonly point: PointRef; readonly event: PointEvent }
  | { readonly action: 'future.create' }
  | { readonly action: 'future.view'; readonly item: FutureView }
  | { readonly action: 'future.edit'; readonly item: FutureRef }
  | { readonly action: 'future.transition'; readonly item: FutureRef; readonly event: FutureEvent }
  /** „Napsat zprávu“ and „Zprávu psát nebudu“ on an akce: the author's, once it is approved. */
  | { readonly action: 'future.report'; readonly item: FutureRef }
  | { readonly action: 'review.queue' }
  | { readonly action: 'issue.preview' }
  /** Přítomni/Hosté, POKYNY, ohlasy, Příloha 2 */
  | { readonly action: 'issue.edit' }
  /** Generate, reopen, skip */
  | { readonly action: 'issue.generate' }
  | { readonly action: 'archive.view' }
  | { readonly action: 'registry.view' }
  | { readonly action: 'registry.edit' }
  | { readonly action: 'registry.newSchoolYear' }
  | { readonly action: 'pointTypes.manage' }
  | { readonly action: 'settings.manage' }
  | { readonly action: 'users.view' }
  | { readonly action: 'users.manage' }
  | { readonly action: 'access.decide' };

export type Action = Check['action'];

function reviewActor(actor: Actor, owner: Owner): ReviewActor {
  const isAuthor = 'isAuthor' in owner ? owner.isAuthor : owner.authorId === actor.id;
  return { kind: 'user', role: actor.role, isAuthor };
}

/** Writing the report is the author's; declining it too (a reviewer's decline is not offered). */
const canReport = (a: ReviewActor) => REPORT_MACHINE.write.allowed(a);

const has = (actor: Actor, minimum: Role) => atLeast(actor.role, minimum);
/** Drafts stay with their author: reviewers see only what was handed in (SSU-5). */
const seen = <S extends string>(actor: Actor, row: Seen<S>) =>
  row.authorId === actor.id ||
  (has(actor, 'reviewer') && row.everSubmitted && row.state !== 'draft');
/** The registry and archive name every student; students never see them. */
const staffReviewer = (actor: Actor) => has(actor, 'reviewer') && !actor.isStudent;

/**
 * Students are limited to the submitter role (plan §1). Enforced here as
 * well as in the database, so bad data cannot widen a student's rights.
 */
function effective(actor: Actor): Actor {
  return actor.isStudent && atLeast(actor.role, 'reviewer')
    ? { ...actor, role: 'submitter' }
    : actor;
}

/**
 * The single authorization decision of the app. Pure and deny-by-default:
 * inactive accounts can do nothing, pending ones can only ask for access,
 * and an action the switch does not know is refused.
 */
export function can(subject: Actor, check: Check): boolean {
  const actor = effective(subject);
  if (actor.status !== 'active') return false;
  if (actor.role === 'pending')
    return check.action === 'access.request' || check.action === 'profile.manage';

  switch (check.action) {
    case 'access.request':
      return false;
    case 'profile.manage':
    case 'directory.search':
    case 'point.create':
    case 'future.create':
      return has(actor, 'submitter');
    case 'point.view':
      return seen(actor, check.point);
    case 'point.edit':
      return canEditPoint(check.point.state, reviewActor(actor, check.point));
    case 'point.transition':
      return availableEvents(
        POINT_MACHINE,
        check.point.state,
        reviewActor(actor, check.point),
      ).includes(check.event);
    case 'future.view':
      return (
        seen(actor, check.item) || (check.item.kind === 'akce' && check.item.state === 'approved')
      );
    case 'future.edit':
      return canEditFuture(check.item.state, reviewActor(actor, check.item));
    case 'future.transition':
      return availableEvents(
        FUTURE_MACHINE,
        check.item.state,
        reviewActor(actor, check.item),
      ).includes(check.event);
    case 'future.report':
      return check.item.state === 'approved' && canReport(reviewActor(actor, check.item));
    case 'review.queue':
    case 'issue.preview':
      return has(actor, 'reviewer');
    case 'archive.view':
    case 'registry.view':
      return staffReviewer(actor);
    case 'issue.edit':
    case 'issue.generate':
    case 'registry.edit':
    case 'registry.newSchoolYear':
    case 'pointTypes.manage':
    case 'settings.manage':
    case 'users.view':
    case 'users.manage':
    case 'access.decide':
      return actor.role === 'headmaster' && !actor.isStudent;
    default: {
      const _exhaustive: never = check;
      return false;
    }
  }
}
