import type { AccessRequestRecord, Tx, UserRecord } from '@/application/ports';
import type { TemplateName } from '@/notify';

/** What each mail is about, as the worker reads it again at send time. */
export interface MailSubjects {
  readonly 'access.approved': AccessRequestRecord;
  readonly 'access.rejected': AccessRequestRecord;
  readonly 'access.blocked': AccessRequestRecord;
  /** The user granted access: also the recipient. */
  readonly 'access.granted': UserRecord;
  readonly 'mail.check': UserRecord;
}

/** The repositories a subject is read from. */
export type SubjectReaders = Pick<Tx, 'accessRequests' | 'users'>;

const request = (tx: SubjectReaders, id: string) => tx.accessRequests.get(id);
const user = (tx: SubjectReaders, id: string) => tx.users.get(id);

/** One loader per template; a subject that is gone (a purged request) reads as null. */
const SUBJECTS: {
  readonly [T in TemplateName]: (tx: SubjectReaders, id: string) => Promise<MailSubjects[T] | null>;
} = {
  'access.approved': request,
  'access.rejected': request,
  'access.blocked': request,
  'access.granted': user,
  'mail.check': user,
};

/** Reads the subject a `mail.send` job names, by the loader of its template. */
export function loadSubject<T extends TemplateName>(
  tx: SubjectReaders,
  template: T,
  subjectId: string,
): Promise<MailSubjects[T] | null> {
  const load: (tx: SubjectReaders, id: string) => Promise<MailSubjects[T] | null> =
    SUBJECTS[template];
  return load(tx, subjectId);
}
