import type { AccessRequestRecord } from '@/application/ports';
import type { Actor } from '@/domain/actor';
import type { ReviewActor } from '@/domain/review';

type Request = Pick<AccessRequestRecord, 'state' | 'userId'>;

/** The actor as the access machine sees them: the requester is the request's author. */
export function machineActor(actor: Actor, request: Request): ReviewActor {
  return { kind: 'user', role: actor.role, isAuthor: request.userId === actor.id };
}
