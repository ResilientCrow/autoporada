import {
  ConstraintViolation,
  scopeOf,
  ScopeViolation,
  StaleVersion,
  type TxContext,
  type UserRecord,
  type UserRepo,
} from '@/application/ports';
import { admits, can } from '@/domain/policy';

import { guard } from './guards';
import { newId, type FakeTxState } from './state';

/** The user repository over the fake state, with the same scope and version rules. */
export function fakeUserRepo(tx: FakeTxState, ctx: TxContext): UserRepo {
  const { principal } = ctx;
  const { users } = tx.draft;
  const visible = (u: UserRecord) => admits(scopeOf(principal, 'user'), { ownerId: u.id });
  const find = (id: string) => {
    const user = users.get(id);
    return user && visible(user) ? user : null;
  };
  const save = (user: UserRecord) => {
    users.set(user.id, user);
    tx.written.push({ type: 'user', id: user.id });
    return user;
  };

  return {
    async get(id) {
      guard(tx, false);
      return find(id);
    },
    async lock(id) {
      guard(tx, true);
      return find(id);
    },
    async list(filter = {}) {
      guard(tx, false);
      return [...users.values()]
        .filter(visible)
        .filter((u) => !filter.role || u.role === filter.role)
        .filter((u) => !filter.status || u.status === filter.status)
        .sort((a, b) => (a.id < b.id ? -1 : 1));
    },
    async upsertFromClaims(identity) {
      guard(tx, true);
      if (principal.kind !== 'system') throw new ScopeViolation();
      const known = [...users.values()].find(
        (u) => u.tid === identity.tid && u.oid === identity.oid,
      );
      const display = {
        displayName: identity.displayName,
        email: identity.email,
        jobTitle: identity.jobTitle,
        department: identity.department,
        updatedAt: ctx.now,
      };
      if (known) return save({ ...known, ...display });
      return save({
        id: newId(tx.draft),
        tid: identity.tid,
        oid: identity.oid,
        ...display,
        role: 'pending',
        isStudent: false,
        status: 'active',
        version: 1,
        createdAt: ctx.now,
      });
    },
    async changeAccess(id, expectedVersion, patch) {
      guard(tx, true);
      if (principal.kind === 'user' && !can(principal.actor, { action: 'users.manage' })) {
        throw new ScopeViolation();
      }
      const user = find(id);
      if (!user || user.version !== expectedVersion) throw new StaleVersion();
      const { role = user.role, isStudent = user.isStudent, status = user.status } = patch;
      // As the users_student_role CHECK.
      if (isStudent && role !== 'pending' && role !== 'submitter') {
        throw new ConstraintViolation('users_student_role');
      }
      // As the deferred users_active_headmaster trigger: checked at commit.
      if (user.role === 'headmaster' && user.status === 'active') {
        if (role !== 'headmaster' || status !== 'active') {
          tx.atCommit.push(() => {
            const left = [...users.values()].some(
              (u) => u.role === 'headmaster' && u.status === 'active',
            );
            if (!left) throw new ConstraintViolation('users_active_headmaster');
          });
        }
      }
      // As the users_end_sessions trigger: a change of access ends the user's sessions.
      if (role !== user.role || isStudent !== user.isStudent || status !== user.status) {
        for (const [id, session] of tx.draft.sessions) {
          if (session.userId === user.id) tx.draft.sessions.delete(id);
        }
      }
      return save({
        ...user,
        role,
        isStudent,
        status,
        version: user.version + 1,
        updatedAt: ctx.now,
      });
    },
    async countActiveHeadmasters() {
      guard(tx, false);
      return [...users.values()].filter(
        (u) => visible(u) && u.role === 'headmaster' && u.status === 'active',
      ).length;
    },
  };
}
