import { and, count, eq, inArray, sql } from 'drizzle-orm';

import {
  scopeOf,
  ScopeViolation,
  StaleVersion,
  type TxContext,
  type UserRepo,
} from '@/application/ports';
import { can, type Check } from '@/domain/policy';

import { scopeWhere } from '../scope-sql';
import { users } from '../schema';
import type { TxDatabase } from './database';

/** The columns a UserRecord is made of; new columns stay out until named here. */
export const USER_RECORD = {
  id: users.id,
  tid: users.tid,
  oid: users.oid,
  displayName: users.displayName,
  email: users.email,
  jobTitle: users.jobTitle,
  department: users.department,
  role: users.role,
  tier: users.tier,
  salutation: users.salutation,
  titlesBefore: users.titlesBefore,
  titlesAfter: users.titlesAfter,
  status: users.status,
  version: users.version,
  createdAt: users.createdAt,
  updatedAt: users.updatedAt,
};

export function createUserRepo(db: TxDatabase, ctx: TxContext): UserRepo {
  const { principal } = ctx;
  const visible = () => scopeWhere(scopeOf(principal, 'user'), { owner: users.id });
  /** Privileged writes re-check the policy, whatever the use case declared (ADR 0011). */
  const require = (check: Check) => {
    if (principal.kind === 'user' && !can(principal.actor, check)) throw new ScopeViolation();
  };
  const byId = (id: string) =>
    db
      .select(USER_RECORD)
      .from(users)
      .where(and(eq(users.id, id), visible()));

  return {
    async get(id) {
      const [row] = await byId(id);
      return row ?? null;
    },
    async lock(id) {
      const [row] = await byId(id).for('update');
      return row ?? null;
    },
    async getMany(ids) {
      if (ids.length === 0) return [];
      return db
        .select(USER_RECORD)
        .from(users)
        .where(and(inArray(users.id, [...ids]), visible()))
        .orderBy(users.id);
    },
    async list(filter = {}) {
      return db
        .select(USER_RECORD)
        .from(users)
        .where(
          and(
            visible(),
            filter.role && eq(users.role, filter.role),
            filter.status && eq(users.status, filter.status),
          ),
        )
        .orderBy(users.id);
    },
    async upsertFromClaims(identity) {
      if (principal.kind !== 'system') throw new ScopeViolation();
      const display = {
        displayName: identity.displayName,
        email: identity.email,
        jobTitle: identity.jobTitle,
        department: identity.department,
        updatedAt: ctx.now,
      };
      const [row] = await db
        .insert(users)
        .values({ tid: identity.tid, oid: identity.oid, ...display, createdAt: ctx.now })
        // Display fields only: role, status and the tier change through changeAccess.
        .onConflictDoUpdate({ target: [users.tid, users.oid], set: display })
        .returning(USER_RECORD);
      if (!row) throw new Error('upsertFromClaims: the upsert returned no row');
      return row;
    },
    async changeAccess(id, expectedVersion, patch) {
      require({ action: 'users.manage' });
      const { role, tier, status } = patch;
      // The own row takes a tier-only patch (ADR 0072, decision A); the role check keeps it staff.
      const ownAccess = role !== undefined || status !== undefined;
      if (principal.kind === 'user' && principal.actor.id === id && ownAccess) {
        throw new ScopeViolation();
      }
      const [row] = await db
        .update(users)
        .set({
          // Named one by one: a wider object passed as a patch cannot touch other columns.
          ...(role !== undefined && { role }),
          ...(tier !== undefined && { tier }),
          ...(status !== undefined && { status }),
          version: sql`${users.version} + 1`,
          updatedAt: ctx.now,
        })
        .where(and(eq(users.id, id), eq(users.version, expectedVersion), visible()))
        .returning(USER_RECORD);
      if (!row) throw new StaleVersion();
      return row;
    },
    async setAddress(id, patch) {
      if (principal.kind === 'system') {
        if (principal.reason !== 'test.seed') throw new ScopeViolation();
      } else if (principal.actor.id !== id || !can(principal.actor, { action: 'profile.manage' })) {
        throw new ScopeViolation();
      }
      const [row] = await db
        .update(users)
        .set({
          salutation: patch.salutation,
          titlesBefore: patch.titlesBefore,
          titlesAfter: patch.titlesAfter,
          updatedAt: ctx.now,
        })
        .where(and(eq(users.id, id), visible()))
        .returning(USER_RECORD);
      if (!row) throw new ScopeViolation();
      return row;
    },
    async countActiveHeadmasters() {
      const [row] = await db
        .select({ n: count() })
        .from(users)
        .where(and(eq(users.role, 'headmaster'), eq(users.status, 'active'), visible()));
      return row?.n ?? 0;
    },
  };
}
