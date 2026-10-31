/**
 * One API over two worlds (ADR 0011): the same test runs against in-memory
 * fakes in `pnpm test` and against PostgreSQL in `pnpm test:integration`.
 * Call setupWorld() at the top of a test file; every test starts empty, at
 * the clock's start.
 */
import { randomUUID } from 'node:crypto';

import { beforeEach, inject } from 'vitest';

import { runUseCase, type PipelineFailure, type Result, type UseCase } from '@/application/core';

import {
  system,
  type AccessRequestRecord,
  type AppDeps,
  type Db,
  type PointTypeRecord,
  type Principal,
  type RegistryEntryRecord,
  type RegistryListRecord,
  type Tx,
  type TxMode,
  type UserPrincipal,
  type UserRecord,
} from '@/application/ports';

import { setupTestDatabase, type TestDatabase } from '../database';
import { FixedClock } from './clock';
import { createFakeDb, type FakeDb } from './fake/db';
import { refusedBy } from './fake/guards';
import { eraseFakeUser, newId, type AuditRow, type JobRow } from './fake/state';
import {
  auditRows,
  deleteUser,
  insertAccessRequest,
  insertPointType,
  insertRegistryEntry,
  insertRegistryList,
  insertSetting,
  jobRows,
  lockWaits,
  nextListPosition,
  resetTables,
} from './pg/backend';

declare module 'vitest' {
  export interface ProvidedContext {
    world: 'fake' | 'pg';
  }
}

type UserSeed = Partial<
  Pick<UserRecord, 'role' | 'isStudent' | 'status' | 'displayName' | 'tid' | 'oid' | 'email'>
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

/** A point type to seed; migration 0014's placeholders are not in either world (resetTables empties them). */
type PointTypeSeed = Partial<Omit<PointTypeRecord, 'id' | 'version' | 'name' | 'position'>> &
  Pick<PointTypeRecord, 'name' | 'position'>;

/** A registry list to seed; migration 0032's four lists are in neither world (resetTables truncates them). */
type RegistryListSeed = Partial<Omit<RegistryListRecord, 'id' | 'version'>> &
  Pick<RegistryListRecord, 'key' | 'title'>;

/** A registry entry to seed; `printed` stamps it as listed by a generated document. */
export type RegistryEntrySeed = Partial<
  Pick<
    RegistryEntryRecord,
    'givenName' | 'familyName' | 'classCode' | 'addedAt' | 'removedAt' | 'archivedYear'
  >
> &
  Pick<RegistryEntryRecord, 'listId'> & { readonly printed?: boolean };

/** What the backend inserts for an entry: `printed` has become the id of a real issue or null. */
type RegistryEntryRow = Omit<RegistryEntryRecord, 'id' | 'version'>;

const SEED_REASON = 'Učím informatiku od září.';

export interface World {
  readonly kind: 'fake' | 'pg';
  readonly clock: FixedClock;
  readonly deps: AppDeps;
  /**
   * The worker's transactions: autoporada_worker in the pg world, the only
   * role that may touch the mail ledger. Seed through `seed` and `tx` as usual.
   */
  readonly workerDb: Db;
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
    /** Written straight into the table: no port writes point types before commit 49. */
    pointType(seed: PointTypeSeed): Promise<PointTypeRecord>;
    /** Written straight into the table at version 1, whatever the value: no port writes settings yet. */
    setting(key: string, value: unknown): Promise<void>;
    /** A list at version 1, past the repository's rules; `position` defaults to after the last, the purpose to `point4`. */
    registryList(seed: RegistryListSeed): Promise<RegistryListRecord>;
    /** An entry at version 1, past the repository's rules; `printed` gives it a first-published issue. */
    registryEntry(seed: RegistryEntrySeed): Promise<RegistryEntryRecord>;
  };
  readonly inspect: {
    audit(): Promise<readonly AuditRow[]>;
    jobs(): Promise<readonly JobRow[]>;
  };
  readonly erase: {
    /** Deletes a user straight from the table (no port deletes users yet); their rows cascade. */
    user(id: string): Promise<void>;
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
  /** Runs SQL as the owner, past grants and repositories, for guards the ports cannot reach. */
  owner<R extends object>(sql: string, params?: unknown[]): Promise<R[]>;
}

/** What differs between the worlds; the rest of the World is built on top. */
interface Backend {
  readonly db: AppDeps['db'];
  readonly workerDb: Db;
  readonly fake?: FakeDb;
  readonly pg?: PgInspector;
  audit(): Promise<readonly AuditRow[]>;
  jobs(): Promise<readonly JobRow[]>;
  insertAccessRequest(row: AccessRequestRow): Promise<AccessRequestRecord>;
  insertPointType(row: Omit<PointTypeRecord, 'id' | 'version'>): Promise<PointTypeRecord>;
  insertSetting(key: string, value: unknown): Promise<void>;
  insertRegistryList(row: Omit<RegistryListRecord, 'id' | 'version'>): Promise<RegistryListRecord>;
  /** `printed`: whether to give the entry a first-published issue (a row is made in the database). */
  insertRegistryEntry(row: RegistryEntryRow, printed: boolean): Promise<RegistryEntryRecord>;
  nextListPosition(): Promise<number>;
  deleteUser(id: string): Promise<void>;
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

/**
 * What `erase.user` throws when a foreign key keeps the user, by the key's name: PostgreSQL's own
 * error carries it in `constraint`, the fake's DatabaseFailure in its code (ADR 0022).
 */
export const erasureRefusedBy = (kind: World['kind'], constraint: string) =>
  kind === 'pg' ? { constraint } : { sqlstate: `db.constraint.${constraint}` };

function buildWorld(kind: World['kind'], backend: () => Backend): World {
  const clock = new FixedClock();
  const world: World = {
    kind,
    clock,
    get deps() {
      return { db: backend().db, clock };
    },
    get workerDb() {
      return backend().workerDb;
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
            email: seed.email ?? null,
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
      pointType: (seed) =>
        backend().insertPointType({
          titleGender: null,
          defaultBullets: [],
          active: true,
          locked: false,
          ...seed,
        }),
      setting: (key, value) => backend().insertSetting(key, value),
      registryList: async (seed) => {
        const position = seed.position ?? (await backend().nextListPosition());
        return backend().insertRegistryList({
          docLabel: `seznam ${seed.title}`,
          purpose: 'point4',
          active: true,
          ...seed,
          position,
        });
      },
      registryEntry: ({ printed = false, ...seed }) =>
        backend().insertRegistryEntry(
          {
            givenName: 'Jan',
            familyName: 'Novák',
            classCode: '1.A',
            addedAt: clock.now(),
            removedAt: null,
            archivedYear: null,
            ...seed,
            firstPublishedIssueId: null,
          },
          printed,
        ),
    },
    inspect: {
      audit: () => backend().audit(),
      jobs: () => backend().jobs(),
    },
    erase: { user: (id) => backend().deleteUser(id) },
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
    workerDb: db,
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
    async insertPointType(row) {
      const type = { ...row, id: newId(db.state()), version: 1 };
      db.state().pointTypes.set(type.id, type);
      return type;
    },
    async insertSetting(key, value) {
      // settings_value: every value is an object
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw refusedBy('settings_value');
      }
      db.state().settings.set(key, { value: structuredClone(value), version: 1 });
    },
    async nextListPosition() {
      return Math.max(0, ...[...db.state().registryLists.values()].map((l) => l.position)) + 1;
    },
    async insertRegistryList(row) {
      const lists = db.state().registryLists;
      const list = { ...row, id: newId(db.state()), version: 1 };
      if ([...lists.values()].some((l) => l.key === row.key || l.title === row.title)) {
        throw refusedBy('registry_lists_key_key');
      }
      lists.set(list.id, list);
      return list;
    },
    async insertRegistryEntry(row, printed) {
      const state = db.state();
      if (!state.registryLists.has(row.listId)) {
        throw refusedBy('registry_entries_list_id_registry_lists_id_fk');
      }
      const entry = {
        ...row,
        firstPublishedIssueId: printed ? newId(state) : null,
        id: newId(state),
        version: 1,
      };
      state.registryEntries.set(entry.id, entry);
      return entry;
    },
    async deleteUser(id) {
      eraseFakeUser(db.state(), id);
    },
  };
}

function pgBackend(database: TestDatabase): Backend {
  return {
    db: database.app,
    workerDb: database.worker,
    pg: {
      lockWaits: () => lockWaits(database),
      owner: (sql, params) => database.owner(sql, params),
    },
    audit: () => auditRows(database),
    jobs: () => jobRows(database),
    insertAccessRequest: (row) => insertAccessRequest(database, row),
    insertPointType: (row) => insertPointType(database, row),
    insertSetting: (key, value) => insertSetting(database, key, value),
    nextListPosition: () => nextListPosition(database),
    insertRegistryList: (row) => insertRegistryList(database, row),
    insertRegistryEntry: (row, printed) => insertRegistryEntry(database, row, printed),
    deleteUser: (id) => deleteUser(database, id),
  };
}

/** The world this test project runs in, fresh for every test, its clock back at its start. */
export function setupWorld(): World {
  const world = openWorld();
  beforeEach(() => world.clock.reset());
  return world;
}

function openWorld(): World {
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
