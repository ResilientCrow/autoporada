import { randomBytes, randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

import { accessRequests, sessions, userFunctions, users } from '@/infra/db/schema';

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

  it.each(['student', 'absolvent'] as const)('never lets a %s review', async (tier) => {
    expect(await pgErrorOf(insertUser({ tier, role: 'reviewer' }))).toMatchObject(
      violation('23514', 'users_student_role'),
    );
    const id = await insertUser({ tier, role: 'submitter' });
    const promote = database.db.update(users).set({ role: 'headmaster' }).where(eq(users.id, id));
    expect(await pgErrorOf(promote)).toMatchObject(violation('23514', 'users_student_role'));
  });

  it('lets a user without a tier or with a staff tier hold any role', async () => {
    await insertUser({ role: 'headmaster' });
    await insertUser({ tier: 'vedeni', role: 'reviewer' });
    await insertUser({ tier: 'reditel', role: 'headmaster' });
  });

  it('takes only the known tiers', async () => {
    const odd = database.owner(
      `INSERT INTO users (tid, oid, display_name, tier) VALUES ('${TID}', '${randomUUID()}', 'x', 'host')`,
    );
    expect(await pgErrorOf(odd)).toMatchObject(violation('23514', 'users_tier'));
  });
});

describe('a user’s own address (ADR 0072 item 6)', () => {
  const insertOwner = (columns: string, values: string) =>
    database.owner(
      `INSERT INTO users (tid, oid, display_name, ${columns}) VALUES ('${TID}', '${randomUUID()}', 'x', ${values})`,
    );

  it('starts empty, and keeps a salutation', async () => {
    const id = await insertUser();
    const [fresh] = await database.db.select().from(users).where(eq(users.id, id));
    expect(fresh).toMatchObject({ salutation: null });
    const withAddress = await insertUser({ salutation: 'slecna' });
    const [row] = await database.db.select().from(users).where(eq(users.id, withAddress));
    expect(row).toMatchObject({ salutation: 'slecna' });
  });

  it('takes only the three salutations', async () => {
    expect(await pgErrorOf(insertOwner('salutation', `'pane'`))).toMatchObject(
      violation('23514', 'users_salutation'),
    );
  });
});

describe('a user’s functions (ADR 0072 item 4)', () => {
  const insertFunction = (userId: string, over: Partial<typeof userFunctions.$inferInsert> = {}) =>
    database.db
      .insert(userFunctions)
      .values({ userId, head: 'zastupce', complement: 'pro majetek', position: 0, ...over });
  const insertRaw = (userId: string, head: string, complement: string) =>
    database.owner(
      `INSERT INTO user_functions (user_id, head, complement, position) VALUES ('${userId}', '${head}', ${complement}, 0)`,
    );

  it('keeps several functions of one user in order, a complement being optional', async () => {
    const id = await insertUser();
    await insertFunction(id, { position: 0 });
    await insertFunction(id, { head: 'clen', complement: null, position: 1 });
    const rows = await database.db
      .select()
      .from(userFunctions)
      .where(eq(userFunctions.userId, id))
      .orderBy(userFunctions.position);
    expect(rows.map((r) => [r.head, r.complement])).toEqual([
      ['zastupce', 'pro majetek'],
      ['clen', null],
    ]);
  });

  it('keys a function by user and position', async () => {
    const id = await insertUser();
    await insertFunction(id);
    expect(await pgErrorOf(insertFunction(id))).toMatchObject(
      violation('23505', 'user_functions_user_id_position_pk'),
    );
  });

  it('takes only the four heads', async () => {
    for (const head of ['statutarni-zastupce', 'zastupce', 'vedouci', 'clen']) {
      await insertRaw(await insertUser(), head, 'NULL');
    }
    const id = await insertUser();
    expect(await pgErrorOf(insertRaw(id, 'reditel', 'NULL'))).toMatchObject(
      violation('23514', 'user_functions_head'),
    );
  });

  it('caps the complement at 80 characters and refuses control characters', async () => {
    const id = await insertUser();
    await insertFunction(id, { complement: 'x'.repeat(80) });
    expect(await pgErrorOf(insertRaw(id, 'clen', `'${'x'.repeat(81)}'`))).toMatchObject(
      violation('23514', 'user_functions_complement'),
    );
    for (const bad of [`E'a\\nb'`, `E'a\\tb'`, `E'a\\u0007b'`]) {
      expect(await pgErrorOf(insertRaw(id, 'clen', bad))).toMatchObject(
        violation('23514', 'user_functions_complement'),
      );
    }
  });

  it('goes with the user', async () => {
    const id = await insertUser();
    await insertFunction(id);
    await database.db.delete(users).where(eq(users.id, id));
    expect(
      await database.db.select().from(userFunctions).where(eq(userFunctions.userId, id)),
    ).toEqual([]);
  });

  it('refuses a function of nobody', async () => {
    expect(await pgErrorOf(insertFunction(randomUUID()))).toMatchObject(
      violation('23503', 'user_functions_user_id_users_id_fk'),
    );
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

  const signedIn = async (tier: NewUser['tier']) => {
    const userId = await insertUser({ role: 'submitter', tier });
    const now = Date.now();
    await database.db.insert(sessions).values({
      userId,
      tokenHash: randomBytes(32),
      authTime: new Date(now),
      idleExpiresAt: new Date(now + 3600_000),
      absExpiresAt: new Date(now + 7200_000),
    });
    return userId;
  };
  const sessionsOf = async (userId: string) =>
    (await database.db.select().from(sessions).where(eq(sessions.userId, userId))).length;

  it.each([
    [null, 'student'],
    ['ucitel', 'absolvent'],
    ['student', 'zamestnanec'],
    ['absolvent', 'ucitel'],
  ] as const)('signs the user out when the tier goes from %s to %s', async (from, to) => {
    const userId = await signedIn(from);
    await database.owner(`UPDATE users SET tier = $1 WHERE id = $2`, [to, userId]);
    expect(await sessionsOf(userId)).toBe(0);
  });

  it.each([
    ['ucitel', 'vedeni'],
    [null, 'reditel'],
    ['student', 'absolvent'],
    ['vedeni', 'reditel'],
  ] as const)('keeps the user signed in when the tier goes from %s to %s', async (from, to) => {
    const userId = await signedIn(from);
    await database.owner(`UPDATE users SET tier = $1 WHERE id = $2`, [to, userId]);
    expect(await sessionsOf(userId)).toBe(1);
  });
});
