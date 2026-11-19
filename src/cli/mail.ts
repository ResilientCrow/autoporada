/**
 * `mail:test --user <id>` (ADR 0016): sends a short test mail through the worker, the way a
 * decision mail goes, so the operator sees whether mail leaves the server. Only to staff who
 * review: a test mail to a student or to anyone else's mailbox is not what this is for.
 */
import { mailJob } from '@/application/notifications';
import { system, type Clock, type Db } from '@/application/ports';
import { isStudentTier } from '@/domain/actor';

export const MAIL_TEST_USAGE = 'mail:test --user <id>';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RULE = 'mail:test sends only to an active reviewer or headmaster who is not a student';

export interface MailTestDeps {
  /** The owner's transactions, with the job producer bound (main.ts). */
  readonly db: Db;
  readonly clock: Clock;
  /** A fresh UUID for each test mail; application code makes none itself. */
  readonly newId: () => string;
}

function parseUser(args: readonly string[]): string {
  const [flag, id, ...rest] = args;
  if (flag !== '--user' || id === undefined || !UUID.test(id) || rest.length > 0) {
    throw new Error(`Usage: ${MAIL_TEST_USAGE}`);
  }
  return id;
}

/**
 * One owner transaction: checks the target, records `cli.mail-test` (ids only) and enqueues
 * the mail, so either both exist or neither. Refusals name the rule, never the person.
 */
export async function mailTest(deps: MailTestDeps, args: readonly string[]): Promise<string[]> {
  const userId = parseUser(args);
  const checkId = deps.newId();
  const ctx = { principal: system('cli:mail-test'), now: deps.clock.now(), requestId: checkId };
  const { dedupeKey } = await deps.db.transaction(ctx, { mode: 'write' }, async (tx) => {
    const user = await tx.users.get(userId);
    if (!user) throw new Error('mail:test: there is no user with that id');
    const eligible =
      user.status === 'active' &&
      !isStudentTier(user.tier) &&
      (user.role === 'reviewer' || user.role === 'headmaster');
    if (!eligible) throw new Error(`mail:test: ${RULE}`);
    if (user.email === null) throw new Error('mail:test: the user has no e-mail address');

    const mail = mailJob('mail.check', { recipientId: user.id, checkId });
    await tx.audit.record({
      action: 'cli.mail-test',
      target: { type: 'user', id: user.id },
      meta: { dedupeKey: mail.dedupeKey },
    });
    await tx.jobs.enqueue('mail.send', mail.data, { dedupeKey: mail.dedupeKey });
    return mail;
  });
  return [`Test mail queued: ${dedupeKey}`];
}
