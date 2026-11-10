import type { UserRecord } from '@/application/ports';
import type { AccessState, PointState, ReviewDecision } from '@/domain/review';
import type { TemplateName } from '@/notify';

import type { MailSubjects, PointDecision } from './subjects';

import { isReviewer } from './digest';
import { isMember as member } from './reminders';
import { isHeadmaster } from './summary';

type UserFacts = Pick<UserRecord, 'id' | 'role' | 'status' | 'isStudent'>;

const decided =
  (state: AccessState, recipientFits: (user: UserFacts) => boolean) =>
  (subject: MailSubjects['access.approved'], recipient: UserFacts) =>
    subject.state === state && recipientFits(recipient);

/**
 * A decision on a point (ADR 0020) holds while the point stands where the
 * decision left it: a resubmit overtakes a return, a return an approval.
 * Only the author is mailed, and only while they can sign in to read it.
 */
const pointDecided =
  (decided: ReviewDecision, states: readonly PointState[]) =>
  ({ event, point }: PointDecision, recipient: UserFacts) =>
    event.event === decided &&
    event.pointId === point.id &&
    states.includes(point.state) &&
    point.authorId === recipient.id &&
    member(recipient);

/**
 * Whether the mail still says something true (ADR 0016): the worker asks this
 * at send time, after a later change may have overtaken the decision. A
 * rejection or a block is moot once the user was granted access by hand, a
 * rejection also once the request was blocked (that mail goes instead), and
 * an approval or a grant once the account was lowered or blocked.
 */
const APPLIES: {
  readonly [T in TemplateName]: (subject: MailSubjects[T], recipient: UserFacts) => boolean;
} = {
  'access.approved': decided('approved', member),
  'access.rejected': decided('rejected', (user) => user.role === 'pending'),
  'access.blocked': decided('blocked', (user) => user.role === 'pending'),
  /** The subject is the recipient. */
  'access.granted': (_subject, recipient) => member(recipient),
  /** The CLI checked the target when it enqueued. */
  'mail.check': () => true,
  'point.returned': pointDecided('return', ['returned']),
  'point.approved': pointDecided('approve', ['approved', 'published']),
  'point.rejected': pointDecided('reject', ['rejected']),
  /** The author is asked while the akce stands approved and its report is not written. */
  'report.prompt': (item, recipient) =>
    item.state === 'approved' &&
    item.reportState === 'none' &&
    item.authorId === recipient.id &&
    member(recipient),
  /** Whoever still owes the Monday's porada a report from an akce, a student too (ADR 0046). */
  'reminder.soft': ({ hasWork }, recipient) => hasWork && member(recipient),
  /** Whoever still has a draft or returned point for the Monday, a student too. */
  'reminder.hard': ({ hasWork }, recipient) => hasWork && member(recipient),
  /** A reviewer who can still sign in, while something is new for them; only the headmaster counts access requests. */
  'reviewer.digest': ({ submitted, accessRequests }, recipient) =>
    isReviewer(recipient) &&
    (submitted > 0 || (recipient.role === 'headmaster' && accessRequests > 0)),
  /** The reminders' audience still: whoever owes a report or waits on the slot. */
  'issue.moved': ({ hasWork }, recipient) => member(recipient) && hasWork,
  /** The akce's author, while the akce stands approved with no report written; the loader drops it past the close. */
  'report.ended': ({ authorId, state, reportState }, recipient) =>
    state === 'approved' &&
    (reportState === 'none' || reportState === 'prompted') &&
    authorId === recipient.id &&
    member(recipient),
  /** The author of the report, while it is still to be handed in. */
  'report.last-call': ({ authorId, open }, recipient) =>
    open && authorId === recipient.id && member(recipient),
  /** The headmaster, while they can sign in; a closed issue has no subject to begin with. */
  'headmaster.summary': (_subject, recipient) => isHeadmaster(recipient),
  'headmaster.late-summary': (_subject, recipient) => isHeadmaster(recipient),
};

/** A missing subject (a decided request purged on 1 September, a deleted point) never applies. */
export function stillApplies<T extends TemplateName>(
  template: T,
  subject: MailSubjects[T] | null,
  recipient: UserFacts,
): boolean {
  const applies: (subject: MailSubjects[T], recipient: UserFacts) => boolean = APPLIES[template];
  return subject !== null && applies(subject, recipient);
}
