import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  ConstraintViolation,
  system,
  type Tx,
  type TxContext,
  type UserRecord,
} from '@/application/ports';

import { setupTestDatabase } from '../../support/database';

const database = setupTestDatabase();
const TID = '00000000-0000-0000-0000-000000000001';

/** PostgreSQL's `error.constraint` must equal the name the app maps to a rule. */
const run = <T>(principal: TxContext['principal'], work: (tx: Tx) => Promise<T>) =>
  database.app.transaction(
    { principal, now: new Date('2026-10-19T08:00:00Z'), requestId: 'req-1' },
    { mode: 'write' },
    work,
  );
const cli = system('cli:test');
const newUser = () =>
  run(cli, (tx) =>
    tx.users.upsertFromClaims({
      tid: TID,
      oid: randomUUID(),
      displayName: 'Jana Nováková',
      email: null,
      jobTitle: null,
      department: null,
    }),
  );
const asUser = (user: UserRecord) => ({
  kind: 'user' as const,
  actor: { id: user.id, role: user.role, status: user.status, isStudent: user.isStudent },
  sessionId: randomUUID(),
  authTime: new Date('2026-10-19T08:00:00Z'),
});

describe('constraint names', () => {
  it('reports the student CHECK as users_student_role', async () => {
    const user = await newUser();
    const failure = await run(cli, (tx) =>
      tx.users.changeAccess(user.id, user.version, { role: 'reviewer', isStudent: true }),
    ).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ConstraintViolation);
    expect(failure).toMatchObject({ constraint: 'users_student_role' });
  });

  it('reports the unique index as access_requests_one_pending', async () => {
    const user = await newUser();
    const ask = () => run(asUser(user), (tx) => tx.accessRequests.create(user.id, 'Prosím.'));
    await ask();
    const failure = await ask().catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ConstraintViolation);
    expect(failure).toMatchObject({ constraint: 'access_requests_one_pending' });
  });

  it('reports the headmaster trigger as users_active_headmaster', async () => {
    const user = await newUser();
    await run(cli, (tx) => tx.users.changeAccess(user.id, user.version, { role: 'headmaster' }));
    const failure = await run(cli, (tx) =>
      tx.users.changeAccess(user.id, user.version + 1, { role: 'reviewer' }),
    ).catch((error: unknown) => error);
    expect(failure).toMatchObject({ constraint: 'users_active_headmaster' });
  });
});
