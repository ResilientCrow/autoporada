import type { AccessRequestRecord } from '@/application/ports';
import type { Actor } from '@/domain/actor';
import {
  ACCESS_MACHINE,
  availableEvents,
  type DecisionEvent,
  type ReviewActor,
} from '@/domain/review';

type Request = Pick<AccessRequestRecord, 'state' | 'userId'>;

/** The actor as the access machine sees them: the requester is the request's author. */
export function machineActor(actor: Actor, request: Request): ReviewActor {
  return { kind: 'user', role: actor.role, isAuthor: request.userId === actor.id };
}

/** What `actor` may decide on `request`: the machine's events, without the requester's cancel. */
export function decisionEvents(actor: Actor, request: Request): DecisionEvent[] {
  return availableEvents(ACCESS_MACHINE, request.state, machineActor(actor, request)).filter(
    (event): event is DecisionEvent => event !== 'cancel',
  );
}
