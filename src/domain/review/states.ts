import { atLeast, type Role } from '@/domain/actor';

import type { Machine } from './machine';

/** Someone acting on a submission: a signed-in user (author or not) or the system itself. */
export type ReviewActor =
  | { readonly kind: 'user'; readonly role: Role; readonly isAuthor: boolean }
  | { readonly kind: 'system' };

const author = (a: ReviewActor) => a.kind === 'user' && a.isAuthor && atLeast(a.role, 'submitter');
const reviewer = (a: ReviewActor) => a.kind === 'user' && atLeast(a.role, 'reviewer');
const headmaster = (a: ReviewActor) => a.kind === 'user' && a.role === 'headmaster';
const system = (a: ReviewActor) => a.kind === 'system';
/** Separation of duties: a reviewer cannot approve their own point; the headmaster can. */
const approver = (a: ReviewActor) =>
  a.kind === 'user' && (a.role === 'headmaster' || (a.role === 'reviewer' && !a.isAuthor));

// ── Points (reports, HOSPODAŘENÍ and POKYNY proposals) ─────────────────────

export type PointState =
  'draft' | 'submitted' | 'returned' | 'approved' | 'rejected' | 'withdrawn' | 'published';

export type PointEvent =
  'submit' | 'retract' | 'withdraw' | 'approve' | 'return' | 'reject' | 'publish' | 'unpublish';

export const POINT_MACHINE: Machine<PointState, PointEvent, ReviewActor> = {
  submit: { from: ['draft', 'returned'], to: 'submitted', allowed: author },
  /** „Stáhnout“: back to a draft before anyone decided. */
  retract: { from: ['submitted'], to: 'draft', allowed: author },
  withdraw: { from: ['draft', 'returned', 'submitted'], to: 'withdrawn', allowed: author },
  approve: { from: ['submitted'], to: 'approved', allowed: approver },
  return: {
    from: ['submitted', 'approved'],
    to: 'returned',
    allowed: reviewer,
    requiresNote: true,
  },
  reject: {
    from: ['submitted', 'approved'],
    to: 'rejected',
    allowed: reviewer,
    requiresNote: true,
  },
  publish: { from: ['approved'], to: 'published', allowed: system },
  /** „Odebrat z čísla“ — only while that issue is reopened (checked by the use case). */
  unpublish: { from: ['published'], to: 'approved', allowed: headmaster },
};

/**
 * Authors edit drafts and returned points; reviewers edit what is waiting.
 * An approved point may be changed only by someone who could have approved
 * it — otherwise a reviewer could rewrite their own point after a colleague
 * approved it, which is self-approval by another route.
 */
export function canEditPoint(state: PointState, actor: ReviewActor): boolean {
  if (author(actor) && (state === 'draft' || state === 'returned')) return true;
  if (state === 'approved') return approver(actor);
  return reviewer(actor) && state === 'submitted';
}

// ── Future items (jednání, akce) ───────────────────────────────────────────

export type FutureState =
  'draft' | 'submitted' | 'returned' | 'approved' | 'rejected' | 'withdrawn' | 'cancelled';

export type FutureEvent =
  'submit' | 'retract' | 'withdraw' | 'approve' | 'return' | 'reject' | 'revise' | 'cancel';

export const FUTURE_MACHINE: Machine<FutureState, FutureEvent, ReviewActor> = {
  submit: { from: ['draft', 'returned'], to: 'submitted', allowed: author },
  retract: { from: ['submitted'], to: 'draft', allowed: author },
  withdraw: { from: ['draft', 'returned', 'submitted'], to: 'withdrawn', allowed: author },
  approve: { from: ['submitted'], to: 'approved', allowed: approver },
  return: {
    from: ['submitted', 'approved'],
    to: 'returned',
    allowed: reviewer,
    requiresNote: true,
  },
  reject: {
    from: ['submitted', 'approved'],
    to: 'rejected',
    allowed: reviewer,
    requiresNote: true,
  },
  /** An author's change to an approved item goes back to review. */
  revise: { from: ['approved'], to: 'submitted', allowed: author },
  cancel: { from: ['approved'], to: 'cancelled', allowed: (a) => author(a) || reviewer(a) },
};

/**
 * Authors edit drafts, returned items and approved ones — an author's change
 * to an approved item sends it back to review (see futureEditNeedsReview).
 * Other reviewers edit what is waiting or approved.
 */
export function canEditFuture(state: FutureState, actor: ReviewActor): boolean {
  if (author(actor)) return state === 'draft' || state === 'returned' || state === 'approved';
  return reviewer(actor) && (state === 'submitted' || state === 'approved');
}

/** True when saving this edit must fire `revise` (approved → submitted). */
export function futureEditNeedsReview(state: FutureState, actor: ReviewActor): boolean {
  return state === 'approved' && author(actor);
}

export type ReportState = 'none' | 'prompted' | 'written' | 'declined';
export type ReportEvent = 'prompt' | 'write' | 'decline';

/** After an akce ends, its author is asked for the report point. */
export const REPORT_MACHINE: Machine<ReportState, ReportEvent, ReviewActor> = {
  prompt: { from: ['none', 'prompted'], to: 'prompted', allowed: system },
  write: { from: ['none', 'prompted'], to: 'written', allowed: author },
  /** „Zpráva nebude“ */
  decline: { from: ['none', 'prompted'], to: 'declined', allowed: (a) => author(a) || reviewer(a) },
};

// ── Issues ─────────────────────────────────────────────────────────────────

export type IssueStatus = 'open' | 'generated' | 'skipped';
export type IssueEvent = 'generate' | 'reopen' | 'skip' | 'unskip';

export const ISSUE_MACHINE: Machine<IssueStatus, IssueEvent, ReviewActor> = {
  generate: { from: ['open'], to: 'generated', allowed: headmaster },
  /** Only the latest generated issue, while the next one is not generated (use case). */
  reopen: { from: ['generated'], to: 'open', allowed: headmaster },
  /** „Porada se nekoná“ */
  skip: { from: ['open'], to: 'skipped', allowed: headmaster },
  unskip: { from: ['skipped'], to: 'open', allowed: headmaster },
};

// ── Access requests ────────────────────────────────────────────────────────

export const ACCESS_STATES = ['pending', 'approved', 'rejected', 'blocked', 'cancelled'] as const;
export const ACCESS_EVENTS = ['approve', 'reject', 'block', 'cancel'] as const;
export type AccessState = (typeof ACCESS_STATES)[number];
export type AccessEvent = (typeof ACCESS_EVENTS)[number];
/** The headmaster's events; the requester's cancel decides nothing. */
export type DecisionEvent = Exclude<AccessEvent, 'cancel'>;

const requester = (a: ReviewActor) => a.kind === 'user' && a.isAuthor;

export const ACCESS_MACHINE: Machine<AccessState, AccessEvent, ReviewActor> = {
  approve: { from: ['pending'], to: 'approved', allowed: headmaster },
  reject: { from: ['pending'], to: 'rejected', allowed: headmaster },
  /** No further requests from this person. */
  block: { from: ['pending', 'rejected'], to: 'blocked', allowed: headmaster },
  cancel: { from: ['pending'], to: 'cancelled', allowed: requester },
};
