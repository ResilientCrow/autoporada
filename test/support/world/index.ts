/**
 * One API over two worlds (ADR 0011): the same test runs against in-memory
 * fakes in `pnpm test` and against PostgreSQL in `pnpm test:integration`.
 * Call setupWorld() at the top of a test file; every test starts empty.
 */
import { randomUUID } from 'node:crypto';

import { beforeEach, inject } from 'vitest';

import { runUseCase, type PipelineFailure, type Result, type UseCase } from '@/application/core';

import {
  system,
  type AccessRequestRecord,
  type AppDeps,
  type Principal,
  type Tx,
  type TxMode,
  type UserPrincipal,
  type UserRecord,
} from '@/application/ports';

import { setupTestDatabase, type TestDatabase } from '../database';
import { FixedClock } from './clock';
import { createFakeDb, type FakeDb } from './fake/db';
import { newId, type AuditRow, type JobRow } from './fake/state';
import { auditRows, insertAccessRequest, jobRows, lockWaits, resetTables } from './pg/backend';

declare module 'vitest' {
  export interface ProvidedContext {
    world: 'fake' | 'pg';
  }
}

type UserSeed = Partial<
  Pick<UserRecord, 'role' | 'isStudent' | 'status' | 'displayName' | 'tid' | 'oid'>
>;

/** A row of someone's request history; `createdAt` defaults to the world's clock. */
interface AccessRequestSeed {
  readonly userId: string;
  readonly state: AccessRequestRecord['state'];
  readonly createdAt?: Date;
  /** Defaults to `createdAt` once decided; always empty while pending. */
  readonly decidedAt?: Date;
  /** Required for approved, rejected and blocked, as the table's CHECK requires. */
  readonly decidedBy?: string;
}

/** A request row as the seed writes it, before the database gives it an id and a version. */
type AccessRequestRow = Omit<AccessRequestRecord, 'id' | 'version'>;

const SEED_REASON = 'Učím informatiku od září.';

export interface World {
  readonly kind: 'fake' | 'pg';
  readonly clock: FixedClock;
  readonly deps: AppDeps;
  tx<T>(principal: Principal, work: (tx: Tx) => Promise<T>, mode?: TxMode): Promise<T>;
  /** Runs a use case through the real pipeline, at the world's clock. */
  run<In, Out>(
    useCase: UseCase<In, Out>,
    principal: Principal,
    input: unknown,
  ): Promise<Result<Out, PipelineFailure>>;
  readonly seed: {
    user(seed?: UserSeed): Promise<UserRecord>;
    /** Written straight into the table, past the repository's rules and the audit log. */
    accessRequest(seed: AccessRequestSeed): Promise<AccessRequestRecord>;
  };
  readonly inspect: {
    audit(): Promise<readonly AuditRow[]>;
    jobs(): Promise<readonly JobRow[]>;
  };
  /** The user as a signed-in principal. */
  as(user: UserRecord, options?: { readonly authTime?: Date }): UserPrincipal;
  /** The fake database, for fake-only checks (history, injected failures). */
  readonly fake: FakeDb | undefined;
  /** PostgreSQL-only checks, for tests of concurrent transactions. */
  readonly pg: PgInspector | undefined;
}

interface PgInspector {
  /** How many of this database's transactions wait on a lock now. */
  lockWaits(): Promise<number>;
}

/** What differs between the worlds; the rest of the World is built on top. */
interface Backend {
  readonly db: AppDeps['db'];
  readonly fake?: FakeDb;
  readonly pg?: PgInspector;
  audit(): Promise<readonly AuditRow[]>;
  jobs(): Promise<readonly JobRow[]>;
  insertAccessRequest(row: AccessRequestRow): Promise<AccessRequestRecord>;
}

function accessRequestRow(seed: AccessRequestSeed, now: Date): AccessRequestRow {
  const decided = seed.state !== 'pending';
  if (decided && seed.state !== 'cancelled' && seed.decidedBy === undefined) {
    throw new Error(`seed.accessRequest: a ${seed.state} request needs decidedBy`);
  }
  const createdAt = seed.createdAt ?? now;
  return {
    userId: seed.userId,
    reason: SEED_REASON,
    state: seed.state,
    decidedBy: decided ? (seed.decidedBy ?? null) : null,
    decidedAt: decided ? (seed.decidedAt ?? createdAt) : null,
    createdAt,
  };
}

export const TEST_TID = '00000000-0000-0000-0000-000000000001';

function buildWorld(kind: World['kind'], backend: () => Backend): World {
  const clock = new FixedClock();
  const world: World = {
    kind,
    clock,
    get deps() {
      return { db: backend().db, clock };
    },
    get fake() {
      return backend().fake;
    },
    get pg() {
      return backend().pg;
    },
    run: (useCase, principal, input) =>
      runUseCase(useCase, { principal, requestId: 'test', input }, { db: backend().db, clock }),
    tx: (principal, work, mode = 'write') =>
      backend().db.transaction({ principal, now: clock.now(), requestId: 'test' }, { mode }, work),
    seed: {
      user: (seed = {}) =>
        world.tx(system('test.seed'), async (tx) => {
          const user = await tx.users.upsertFromClaims({
            tid: seed.tid ?? TEST_TID,
            oid: seed.oid ?? randomUUID(),
            displayName: seed.displayName ?? 'Jana Nováková',
            email: null,
            jobTitle: null,
            department: null,
          });
          const { role, isStudent, status } = seed;
          const patch = {
            ...(role && { role }),
            ...(isStudent !== undefined && { isStudent }),
            ...(status && { status }),
          };
          return Object.keys(patch).length > 0
            ? tx.users.changeAccess(user.id, user.version, patch)
            : user;
        }),
      accessRequest: (seed) => backend().insertAccessRequest(accessRequestRow(seed, clock.now())),
    },
    inspect: {
      audit: () => backend().audit(),
      jobs: () => backend().jobs(),
    },
    as: (user, options = {}) => ({
      kind: 'user',
      actor: { id: user.id, role: user.role, status: user.status, isStudent: user.isStudent },
      sessionId: `session-${user.id}`,
      authTime: options.authTime ?? clock.now(),
    }),
  };
  return world;
}

function fakeBackend(db: FakeDb): Backend {
  return {
    db,
    fake: db,
    audit: async () => db.state().audit,
    jobs: async () => db.state().jobs,
    async insertAccessRequest(row) {
      const { accessRequests } = db.state();
      const pending = [...accessRequests.values()].some(
        (r) => r.userId === row.userId && r.state === 'pending',
      );
      if (row.state === 'pending' && pending) {
        throw new Error('seed.accessRequest: one pending request per user');
      }
      const request = { ...row, id: newId(db.state()), version: 1 };
      accessRequests.set(request.id, request);
      return request;
    },
  };
}

function pgBackend(database: TestDatabase): Backend {
  return {
    db: database.app,
    pg: { lockWaits: () => lockWaits(database) },
    audit: () => auditRows(database),
    jobs: () => jobRows(database),
    insertAccessRequest: (row) => insertAccessRequest(database, row),
  };
}

/** The world this test project runs in, fresh for every test. */
export function setupWorld(): World {
  const kind = inject('world');
  if (kind === 'pg') {
    const database = setupTestDatabase();
    beforeEach(() => resetTables(database));
    return buildWorld(kind, () => pgBackend(database));
  }
  let db = createFakeDb();
  beforeEach(() => {
    db = createFakeDb();
  });
  return buildWorld(kind, () => fakeBackend(db));
}
