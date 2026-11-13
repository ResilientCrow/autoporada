import {
  ConstraintViolation,
  scopeOf,
  ScopeViolation,
  StaleVersion,
  type AccessRequestRecord,
  type AccessRequestRepo,
  type TxContext,
} from '@/application/ports';
import { admits, can, type Check } from '@/domain/policy';

import { guard } from './guards';
import { newId, type FakeTxState } from './state';

/** The access request repository over the fake state, with the same scope and version rules. */
export function fakeAccessRequestRepo(tx: FakeTxState, ctx: TxContext): AccessRequestRepo {
  const { principal } = ctx;
  const { accessRequests } = tx.draft;
  const visible = (r: AccessRequestRecord) =>
    admits(scopeOf(principal, 'accessRequest'), { ownerId: r.userId });
  const find = (id: string) => {
    const request = accessRequests.get(id);
    return request && visible(request) ? request : null;
  };
  const require = (check: Check) => {
    if (principal.kind === 'user' && !can(principal.actor, check)) throw new ScopeViolation();
  };
  const save = (request: AccessRequestRecord) => {
    accessRequests.set(request.id, request);
    tx.written.push({ type: 'access_request', id: request.id });
    return request;
  };
  const byAge = (a: AccessRequestRecord, b: AccessRequestRecord) =>
    a.createdAt.getTime() - b.createdAt.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

  return {
    async get(id) {
      guard(tx, false);
      return find(id);
    },
    async lock(id) {
      guard(tx, true);
      return find(id);
    },
    async forUser(userId) {
      guard(tx, false);
      return [...accessRequests.values()]
        .filter((r) => r.userId === userId && visible(r))
        .sort((a, b) => byAge(b, a));
    },
    async countPendingSince(since) {
      guard(tx, false);
      if (principal.kind !== 'system') throw new ScopeViolation();
      return [...accessRequests.values()].filter(
        (r) => r.state === 'pending' && r.createdAt > since,
      ).length;
    },
    async create(userId, reason) {
      guard(tx, true);
      if (
        principal.kind !== 'user' ||
        principal.actor.id !== userId ||
        !can(principal.actor, { action: 'access.request' })
      ) {
        throw new ScopeViolation();
      }
      // As the access_requests_one_pending unique index.
      const open = [...accessRequests.values()].some(
        (r) => r.userId === userId && r.state === 'pending',
      );
      if (open) throw new ConstraintViolation('access_requests_one_pending');
      return save({
        id: newId(tx.draft),
        userId,
        reason,
        state: 'pending',
        decidedBy: null,
        decidedAt: null,
        version: 1,
        createdAt: ctx.now,
      });
    },
    async transition(id, expectedVersion, to) {
      guard(tx, true);
      const cancel = to === 'cancelled';
      require({ action: cancel ? 'access.request' : 'access.decide' });
      // As pg: a decision names its headmaster (access_requests_decided_by); the system makes none.
      if (!cancel && principal.kind !== 'user') throw new ScopeViolation();
      const request = find(id);
      const foreign = cancel && principal.kind === 'user' && request?.userId !== principal.actor.id;
      if (!request || foreign || request.version !== expectedVersion) throw new StaleVersion();
      return save({
        ...request,
        state: to,
        decidedBy: !cancel && principal.kind === 'user' ? principal.actor.id : null,
        decidedAt: ctx.now,
        version: request.version + 1,
      });
    },
  };
}
