import type { AccessRequestRecord, UserRecord } from '@/application/ports';
import type { AccessState } from '@/domain/review';
import type { TemplateName } from '@/notify';

type RequestFacts = Pick<AccessRequestRecord, 'state'>;
type UserFacts = Pick<UserRecord, 'role' | 'status'>;

/** What a mail's subject is when the worker reads it again: the request decided, or the user. */
type MailSubject = RequestFacts | UserFacts;

const member = (user: UserFacts) => user.role !== 'pending' && user.status === 'active';

const decided =
  (state: AccessState, recipientFits: (user: UserFacts) => boolean) =>
  (subject: MailSubject, recipient: UserFacts) =>
    'state' in subject && subject.state === state && recipientFits(recipient);

/**
 * Whether the mail still says something true (ADR 0016): the worker asks this
 * at send time, after a later change may have overtaken the decision. A
 * rejection or a block is moot once the user was granted access by hand, a
 * rejection also once the request was blocked (that mail goes instead), and
 * an approval or a grant once the account was lowered or blocked.
 */
const APPLIES: {
  readonly [T in TemplateName]: (subject: MailSubject, recipient: UserFacts) => boolean;
} = {
  'access.approved': decided('approved', member),
  'access.rejected': decided('rejected', (user) => user.role === 'pending'),
  'access.blocked': decided('blocked', (user) => user.role === 'pending'),
  /** The subject is the recipient. */
  'access.granted': (_subject, recipient) => member(recipient),
  /** The CLI checked the target when it enqueued. */
  'mail.check': () => true,
};

/** A missing subject (a decided request purged on 1 September) never applies. */
export function stillApplies(
  template: TemplateName,
  subject: MailSubject | null,
  recipient: UserFacts,
): boolean {
  return subject !== null && APPLIES[template](subject, recipient);
}
