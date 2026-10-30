import type {
  AccessRequestRecord,
  FutureMailFacts,
  PointEventMailFacts,
  PointMailFacts,
  Tx,
  UserRecord,
} from '@/application/ports';
import type { TemplateName } from '@/notify';

/** A decision on a point: the event the mail reports, and the point as it stands now. */
export interface PointDecision {
  readonly event: PointEventMailFacts;
  readonly point: PointMailFacts;
}

/** What each mail is about, as the worker reads it again at send time. */
export interface MailSubjects {
  readonly 'access.approved': AccessRequestRecord;
  readonly 'access.rejected': AccessRequestRecord;
  readonly 'access.blocked': AccessRequestRecord;
  /** The user granted access: also the recipient. */
  readonly 'access.granted': UserRecord;
  readonly 'mail.check': UserRecord;
  readonly 'point.returned': PointDecision;
  readonly 'point.approved': PointDecision;
  readonly 'point.rejected': PointDecision;
  /** The akce the author is asked to write a report for. */
  readonly 'report.prompt': FutureMailFacts;
}

/** The repositories a subject is read from. */
export type SubjectReaders = Pick<
  Tx,
  'accessRequests' | 'users' | 'points' | 'pointEvents' | 'futureItems'
>;

const request = (tx: SubjectReaders, id: string) => tx.accessRequests.get(id);
const user = (tx: SubjectReaders, id: string) => tx.users.get(id);
/** The event, then its point, by the worker's granted columns only (F2). */
async function decision(tx: SubjectReaders, eventId: string): Promise<PointDecision | null> {
  const event = await tx.pointEvents.mailFacts(eventId);
  const point = event && (await tx.points.mailFacts(event.pointId));
  return event && point ? { event, point } : null;
}

/** One loader per template; a subject that is gone (a purged request, a deleted point) reads as null. */
const SUBJECTS: {
  readonly [T in TemplateName]: (tx: SubjectReaders, id: string) => Promise<MailSubjects[T] | null>;
} = {
  'access.approved': request,
  'access.rejected': request,
  'access.blocked': request,
  'access.granted': user,
  'mail.check': user,
  'point.returned': decision,
  'point.approved': decision,
  'point.rejected': decision,
  /** By the worker's granted columns only. */
  'report.prompt': (tx, id) => tx.futureItems.mailFacts(id),
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
