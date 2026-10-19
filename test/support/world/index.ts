/**
 * One API over two worlds (ADR 0011): the same test runs against in-memory
 * fakes in `pnpm test` and against PostgreSQL in `pnpm test:integration`.
 * Call setupWorld() at the top of a test file; every test starts empty.
 */
import { randomUUID } from 'node:crypto';

import { beforeEach, inject } from 'vitest';

import {
  system,
  type AppDeps,
  type Principal,
  type Tx,
  type TxMode,
  type UserPrincipal,
  type UserRecord,
} from '@/application/ports';

import { FixedClock } from './clock';
import { createFakeDb, type FakeDb } from './fake/db';
import type { AuditRow, JobRow } from './fake/state';

declare module 'vitest' {
  export interface ProvidedContext {
    world: 'fake' | 'pg';
  }
}

type UserSeed = Partial<
  Pick<UserRecord, 'role' | 'isStudent' | 'status' | 'displayName' | 'tid' | 'oid'>
>;

export interface World {
  readonly kind: 'fake' | 'pg';
  readonly clock: FixedClock;
  readonly deps: AppDeps;
  /** What this world can check; PostgreSQL has no job queue until M7.1. */
  readonly supports: { readonly jobs: boolean };
  tx<T>(principal: Principal, work: (tx: Tx) => Promise<T>, mode?: TxMode): Promise<T>;
  readonly seed: { user(seed?: UserSeed): Promise<UserRecord> };
  readonly inspect: {
    audit(): Promise<readonly AuditRow[]>;
    jobs(): Promise<readonly JobRow[]>;
  };
  /** The user as a signed-in principal. */
  as(user: UserRecord, options?: { readonly authTime?: Date }): UserPrincipal;
  /** The fake database, for fake-only checks (history, injected failures). */
  readonly fake: FakeDb | undefined;
}

/** What differs between the worlds; the rest of the World is built on top. */
interface Backend {
  readonly db: AppDeps['db'];
  readonly supportsJobs: boolean;
  readonly fake?: FakeDb;
  audit(): Promise<readonly AuditRow[]>;
  jobs(): Promise<readonly JobRow[]>;
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
    get supports() {
      return { jobs: backend().supportsJobs };
    },
    get fake() {
      return backend().fake;
    },
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
    supportsJobs: true,
    audit: async () => db.state().audit,
    jobs: async () => db.state().jobs,
  };
}

/** The world this test project runs in, fresh for every test. */
export function setupWorld(): World {
  const kind = inject('world');
  if (kind !== 'fake') throw new Error(`setupWorld: no ${kind} world yet`);
  let db = createFakeDb();
  beforeEach(() => {
    db = createFakeDb();
  });
  return buildWorld(kind, () => fakeBackend(db));
}
