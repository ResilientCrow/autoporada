import { randomBytes, randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

import { accessRequests, sessions, users } from '@/infra/db/schema';

import { pgErrorOf, setupTestDatabase } from '../../support/database';

const database = setupTestDatabase();
const TID = '00000000-0000-0000-0000-000000000001';

type NewUser = typeof users.$inferInsert;
let counter = 0;
const userRow = (over: Partial<NewUser> = {}): NewUser => ({
  tid: TID,
  oid: randomUUID(),
  displayName: `Uživatel ${++counter}`,
  ...over,
});
async function insertUser(over: Partial<NewUser> = {}): Promise<string> {
  const [row] = await database.db.insert(users).values(userRow(over)).returning({ id: users.id });
  return row!.id;
}

const violation = (code: string, constraint: string) => ({ code, constraint });

describe('users', () => {
  it('are keyed by tenant and object id', async () => {
    const oid = randomUUID();
    await insertUser({ oid });
    expect(await pgErrorOf(insertUser({ oid }))).toMatchObject(
      violation('23505', 'users_entra_key'),
    );
  });

  it('never lets a student review', async () => {
    expect(await pgErrorOf(insertUser({ isStudent: true, role: 'reviewer' }))).toMatchObject(
      violation('23514', 'users_student_role'),
    );
    const id = await insertUser({ isStudent: true, role: 'submitter' });
    const promote = database.db.update(users).set({ role: 'headmaster' }).where(eq(users.id, id));
    expect(await pgErrorOf(promote)).toMatchObject(violation('23514', 'users_student_role'));
  });
});

describe('at least one active headmaster', () => {
  const KEEP = violation('23514', 'users_active_headmaster');
  beforeEach(() => database.truncate('users'));
  const setRole = (id: string, role: NewUser['role']) =>
    database.db.update(users).set({ role }).where(eq(users.id, id));

  it('allows a fresh database with no headmaster yet', async () => {
    const id = await insertUser({ role: 'submitter' });
    await setRole(id, 'reviewer');
    await database.db.delete(users).where(eq(users.id, id));
  });

  it('refuses to demote, block or delete the only active headmaster', async () => {
    const id = await insertUser({ role: 'headmaster' });
    expect(await pgErrorOf(setRole(id, 'reviewer'))).toMatchObject(KEEP);
    const block = database.db.update(users).set({ status: 'blocked' }).where(eq(users.id, id));
    expect(await pgErrorOf(block)).toMatchObject(KEEP);
    expect(await pgErrorOf(database.db.delete(users).where(eq(users.id, id)))).toMatchObject(KEEP);
  });

  it('lets one transaction hand the role over in either order', async () => {
    const old = await insertUser({ role: 'headmaster' });
    const next = await insertUser({ role: 'reviewer' });
    await database.db.transaction(async (tx) => {
      await tx.update(users).set({ role: 'reviewer' }).where(eq(users.id, old));
      await tx.update(users).set({ role: 'headmaster' }).where(eq(users.id, next));
    });
    const rows = await database.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.role, 'headmaster'));
    expect(rows).toEqual([{ id: next }]);
  });

  it('stops two concurrent demotions from removing both headmasters', async () => {
    const [a, b] = [
      await insertUser({ role: 'headmaster' }),
      await insertUser({ role: 'headmaster' }),
    ];
    const [first, second] = [await database.connect(), await database.connect()];
    try {
      for (const [client, id] of [
        [first, a],
        [second, b],
      ] as const) {
        await client.query('BEGIN');
        await client.query(`UPDATE users SET role = 'reviewer' WHERE id = $1`, [id]);
      }
      const commits = await Promise.allSettled([first.query('COMMIT'), second.query('COMMIT')]);
      expect(commits.map((c) => c.status).sort()).toEqual(['fulfilled', 'rejected']);
      const failed = commits.find((c) => c.status === 'rejected');
      expect(failed?.reason).toMatchObject(KEEP);
    } finally {
      await Promise.all([first.end(), second.end()]);
    }
    const left = await database.owner(
      `SELECT count(*)::int AS n FROM users WHERE role = 'headmaster'`,
    );
    expect(left).toEqual([{ n: 1 }]);
  });
});

describe('access requests', () => {
  it('allow one pending request per user, and a new one after a decision', async () => {
    const [userId, headmaster] = [await insertUser(), await insertUser({ role: 'headmaster' })];
    const request = { userId, reason: 'Jsem v redakci školního časopisu.' };
    const [first] = await database.db.insert(accessRequests).values(request).returning();
    expect(await pgErrorOf(database.db.insert(accessRequests).values(request))).toMatchObject(
      violation('23505', 'access_requests_one_pending'),
    );
    await database.db
      .update(accessRequests)
      .set({ state: 'rejected', decidedBy: headmaster, decidedAt: new Date() })
      .where(eq(accessRequests.id, first!.id));
    await database.db.insert(accessRequests).values(request);
  });

  it('record who decided and when', async () => {
    const userId = await insertUser();
    const decided = database.db
      .insert(accessRequests)
      .values({ userId, reason: 'x', state: 'approved', decidedAt: new Date() });
    expect(await pgErrorOf(decided)).toMatchObject(
      violation('23514', 'access_requests_decided_by'),
    );
    const undated = database.db
      .insert(accessRequests)
      .values({ userId, reason: 'x', state: 'cancelled' });
    expect(await pgErrorOf(undated)).toMatchObject(
      violation('23514', 'access_requests_decided_at'),
    );
  });
});

describe('sessions', () => {
  const session = (userId: string, tokenHash: Uint8Array) => {
    const now = Date.now();
    return {
      userId,
      tokenHash,
      authTime: new Date(now),
      idleExpiresAt: new Date(now + 4 * 3600_000),
      absExpiresAt: new Date(now + 12 * 3600_000),
    };
  };

  it('store a SHA-256 digest, never anything else', async () => {
    const userId = await insertUser();
    const token = database.db.insert(sessions).values(session(userId, randomBytes(16)));
    expect(await pgErrorOf(token)).toMatchObject(violation('23514', 'sessions_token_hash_sha256'));
    const hash = randomBytes(32);
    await database.db.insert(sessions).values(session(userId, hash));
    const [row] = await database.db.select().from(sessions).where(eq(sessions.userId, userId));
    expect(row?.tokenHash).toEqual(new Uint8Array(hash));
  });

  it('go with their user', async () => {
    const userId = await insertUser();
    await database.db.insert(sessions).values(session(userId, randomBytes(32)));
    await database.db.delete(users).where(eq(users.id, userId));
    expect(await database.db.select().from(sessions).where(eq(sessions.userId, userId))).toEqual(
      [],
    );
  });
});

describe('ending sessions on access changes', () => {
  it('binds the owner too: a role changed by hand signs the user out', async () => {
    const userId = await insertUser({ role: 'submitter' });
    const now = Date.now();
    await database.db.insert(sessions).values({
      userId,
      tokenHash: randomBytes(32),
      authTime: new Date(now),
      idleExpiresAt: new Date(now + 3600_000),
      absExpiresAt: new Date(now + 7200_000),
    });
    await database.owner(`UPDATE users SET role = 'reviewer' WHERE id = '${userId}'`);
    expect(await database.db.select().from(sessions).where(eq(sessions.userId, userId))).toEqual(
      [],
    );
  });
});
