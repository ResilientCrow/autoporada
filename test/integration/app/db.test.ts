import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  ConstraintViolation,
  DatabaseFailure,
  LockTimeout,
  system,
  TxClosed,
  type Tx,
  type TxContext,
  type TxMode,
} from '@/application/ports';

import { setupTestDatabase } from '../../support/database';

const database = setupTestDatabase();
const TID = '00000000-0000-0000-0000-000000000001';
const ctx = (requestId = 'req-1'): TxContext => ({
  principal: system('cli:test'),
  now: new Date('2026-10-19T08:00:00Z'),
  requestId,
});
const run = <T>(work: (tx: Tx) => Promise<T>, mode: TxMode = 'write', lockTimeoutMs?: number) =>
  database.app.transaction(ctx(), { mode, ...(lockTimeoutMs && { lockTimeoutMs }) }, work);
const identity = (displayName = 'Jana Nováková') => ({
  tid: TID,
  oid: randomUUID(),
  displayName,
  email: null,
  jobTitle: null,
  department: null,
});
const countUsers = async () =>
  (await database.owner<{ n: number }>('SELECT count(*)::int AS n FROM users'))[0]?.n;

describe('Db.transaction', () => {
  it('commits what the work did, and rolls everything back when it throws', async () => {
    const before = await countUsers();
    const user = await run((tx) => tx.users.upsertFromClaims(identity()));
    expect(user.createdAt).toEqual(ctx().now);
    await expect(
      run(async (tx) => {
        await tx.users.upsertFromClaims(identity());
        await tx.audit.record({ action: 'test.rollback', target: null });
        throw new Error('work failed');
      }),
    ).rejects.toThrow('work failed');
    expect(await countUsers()).toBe((before ?? 0) + 1);
    const audit = await database.owner(`SELECT 1 FROM audit_events WHERE action = 'test.rollback'`);
    expect(audit).toEqual([]);
  });

  it('refuses writes and row locks in read mode', async () => {
    const user = await run((tx) => tx.users.upsertFromClaims(identity()));
    await expect(run((tx) => tx.users.upsertFromClaims(identity()), 'read')).rejects.toEqual(
      new DatabaseFailure('25006'),
    );
    await expect(run((tx) => tx.users.lock(user.id), 'read')).rejects.toEqual(
      new DatabaseFailure('25006'),
    );
  });

  it('gives up on a lock someone else holds', async () => {
    const user = await run((tx) => tx.users.upsertFromClaims(identity()));
    const other = await database.connect();
    try {
      await other.query('BEGIN');
      await other.query('SELECT 1 FROM users WHERE id = $1 FOR UPDATE', [user.id]);
      await expect(run((tx) => tx.users.lock(user.id), 'write', 100)).rejects.toBeInstanceOf(
        LockTimeout,
      );
    } finally {
      await other.query('ROLLBACK');
      await other.end();
    }
  });

  it('reports a deferred trigger that refuses the COMMIT', async () => {
    await database.owner('TRUNCATE users CASCADE');
    const head = await run(async (tx) => {
      const user = await tx.users.upsertFromClaims(identity());
      return tx.users.changeAccess(user.id, user.version, { role: 'headmaster' });
    });
    await expect(
      run((tx) => tx.users.changeAccess(head.id, head.version, { role: 'reviewer' })),
    ).rejects.toEqual(new ConstraintViolation('users_active_headmaster'));
  });

  it('never lets a failed query carry its SQL, parameters or message', async () => {
    const error: unknown = await run((tx) =>
      tx.users.upsertFromClaims({ ...identity('Jana Tajná'), tid: 'Jana Tajná' }),
    ).catch((e: unknown) => e);
    expect(error).toEqual(new DatabaseFailure('22P02'));
    // The stack is left out: it holds file paths (/Users/… on macOS) and repeats the message.
    const keys = Object.getOwnPropertyNames(error).filter((k) => k !== 'stack');
    expect(JSON.stringify(error, keys)).not.toMatch(/Jana|insert|users/i);
  });

  it('refuses queries from a transaction that has ended', async () => {
    let leaked: Tx | undefined;
    await run(async (tx) => {
      leaked = tx;
    });
    await expect(async () => leaked!.users.list()).rejects.toBeInstanceOf(TxClosed);
    expect(() => leaked!.audit.exempt('retention', { type: 'user', id: 'x' })).toThrow(TxClosed);
  });

  it('records audit events as the app, with the request id and the database time', async () => {
    await database.app.transaction(ctx('req-audit'), { mode: 'write' }, (tx) =>
      tx.audit.record({
        action: 'test.audit',
        target: { type: 'user', id: randomUUID() },
        meta: { version: 2 },
      }),
    );
    const [row] = await database.owner<{ data: unknown; request_id: string; fresh: boolean }>(
      `SELECT data, request_id, at > now() - interval '1 minute' AS fresh
         FROM audit_events WHERE action = 'test.audit'`,
    );
    expect(row).toEqual({
      data: { meta: { version: 2 }, system: 'cli:test' },
      request_id: 'req-audit',
      fresh: true,
    });
  });

  it('returns every connection to the pool, whatever happened', async () => {
    // The test pool has 4 connections: a leak would make the later rounds hang.
    for (let round = 0; round < 3; round++) {
      const outcomes = await Promise.allSettled(
        Array.from({ length: 8 }, (_, i) =>
          run(async (tx) => {
            await tx.users.list();
            if (i % 2) throw new Error('fail half of them');
          }),
        ),
      );
      expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(4);
    }
  });

  it('refuses queries that start after the work has settled', async () => {
    const user = await run((tx) => tx.users.upsertFromClaims(identity()));
    const head = await run((tx) =>
      tx.users.changeAccess(user.id, user.version, { role: 'headmaster' }),
    );
    const late = (tx: Tx, patch: Parameters<Tx['users']['changeAccess']>[2]) => {
      const chain = (async () => {
        const u = await tx.users.get(head.id);
        return tx.users.changeAccess(u!.id, u!.version, patch);
      })();
      chain.catch(() => undefined);
      return chain;
    };
    let failed: Promise<unknown> | undefined;
    await expect(
      run(async (tx) => {
        failed = late(tx, { role: 'reviewer' });
        throw new Error('refused');
      }),
    ).rejects.toThrow('refused');
    await expect(failed).rejects.toBeInstanceOf(TxClosed);
    let readOnly: Promise<unknown> | undefined;
    await run(async (tx) => {
      readOnly = late(tx, { status: 'blocked' });
    }, 'read');
    await expect(readOnly).rejects.toBeInstanceOf(TxClosed);
    const [row] = await database.owner<{ role: string; status: string; version: number }>(
      'SELECT role, status, version FROM users WHERE id = $1',
      [head.id],
    );
    expect(row).toEqual({ role: 'headmaster', status: 'active', version: head.version });
  });

  it('does not report a commit that PostgreSQL turned into a rollback', async () => {
    const swallowed = run(async (tx) => {
      await tx.audit.record({ action: 'test.swallowed', target: null });
      await tx.users.get('not-a-uuid').catch(() => null);
      return 'committed?';
    });
    await expect(swallowed).rejects.toEqual(new DatabaseFailure('25P02'));
    const audit = await database.owner(
      `SELECT 1 FROM audit_events WHERE action = 'test.swallowed'`,
    );
    expect(audit).toEqual([]);
  });

  it('survives connections the server drops, idle or in a transaction', async () => {
    await run((tx) => tx.users.list());
    await database.owner(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
        WHERE datname = current_database() AND application_name = 'autoporada-test'`,
    );
    await new Promise((resolve) => setTimeout(resolve, 100));
    await expect(run((tx) => tx.users.list())).resolves.toBeDefined();
    const idle = database.app.transaction(
      ctx(),
      { mode: 'read', idleTimeoutMs: 100 },
      async (tx) => {
        await tx.users.list();
        await new Promise((resolve) => setTimeout(resolve, 400));
        return tx.users.list();
      },
    );
    await expect(idle).rejects.toBeInstanceOf(DatabaseFailure);
    await expect(run((tx) => tx.users.list())).resolves.toBeDefined();
  });

  it('uses the default for a timeout given as undefined', async () => {
    const options = { mode: 'read', statementTimeoutMs: undefined } as const;
    await expect(database.app.transaction(ctx(), options, async () => 'ran')).resolves.toBe('ran');
  });

  it('runs the work again after a deadlock', async () => {
    const [a, b] = await run(async (tx) => [
      await tx.users.upsertFromClaims(identity()),
      await tx.users.upsertFromClaims(identity()),
    ]);
    let attempts = 0;
    const both = Promise.withResolvers<void>();
    let locked = 0;
    const lockBoth = (first: string, second: string) =>
      run(async (tx) => {
        attempts++;
        await tx.users.lock(first);
        if (++locked === 2) both.resolve();
        await both.promise;
        await tx.users.lock(second);
      });
    await Promise.all([lockBoth(a!.id, b!.id), lockBoth(b!.id, a!.id)]);
    expect(attempts).toBe(3);
  });
});
