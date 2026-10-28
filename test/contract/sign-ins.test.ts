import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { DatabaseFailure, ScopeViolation, system, type PendingSignIn } from '@/application/ports';

import { setupWorld } from '../support/world';

const world = setupWorld();
const login = system('auth.login');
const callback = system('auth.callback');
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const MINUTE = 60_000;

const pending = (over: Partial<PendingSignIn> = {}): Omit<PendingSignIn, 'createdAt'> => ({
  purpose: 'login',
  userId: null,
  returnTo: '/porada',
  state: 'S'.repeat(43),
  nonce: 'N'.repeat(43),
  codeVerifier: 'V'.repeat(43),
  expiresAt: new Date(world.clock.now().getTime() + 10 * MINUTE),
  ...over,
});

describe('SignInRepo (port contract)', () => {
  it('hands a sign-in out once, to the cookie and state that started it', async () => {
    await world.tx(login, (tx) => tx.signIns.save(sha('cookie'), pending()));
    const take = () => world.tx(callback, (tx) => tx.signIns.take(sha('cookie'), 'S'.repeat(43)));
    expect(await take()).toEqual({ ...pending(), createdAt: world.clock.now() });
    expect(await take()).toBeNull();
  });

  it('leaves the sign-in in place when the state is foreign', async () => {
    await world.tx(login, (tx) => tx.signIns.save(sha('cookie'), pending()));
    const take = (state: string) =>
      world.tx(callback, (tx) => tx.signIns.take(sha('cookie'), state));
    expect(await take('X'.repeat(43))).toBeNull();
    expect(await take('S'.repeat(43))).not.toBeNull();
  });

  it('lets a user save only their own step-up, and only the system take or purge', async () => {
    const user = await world.seed.user({ role: 'submitter' });
    const other = await world.seed.user({ role: 'submitter' });
    const as = world.as(user);
    await world.tx(as, (tx) =>
      tx.signIns.save(sha('a'), pending({ purpose: 'step_up', userId: user.id })),
    );
    for (const forbidden of [pending(), pending({ purpose: 'step_up', userId: other.id })]) {
      await expect(
        world.tx(as, (tx) => tx.signIns.save(sha('b'), forbidden)),
      ).rejects.toBeInstanceOf(ScopeViolation);
    }
    await expect(
      world.tx(as, (tx) => tx.signIns.take(sha('a'), 'S'.repeat(43))),
    ).rejects.toBeInstanceOf(ScopeViolation);
    await expect(world.tx(as, (tx) => tx.signIns.purgeExpired(10))).rejects.toBeInstanceOf(
      ScopeViolation,
    );
  });

  it('purges expired sign-ins only, at most as many as asked', async () => {
    const now = world.clock.now().getTime();
    await world.tx(login, async (tx) => {
      for (const [i, offset] of [-2, -1, 0, 1].entries()) {
        await tx.signIns.save(
          sha(`c${i}`),
          pending({ expiresAt: new Date(now + offset * MINUTE) }),
        );
      }
    });
    expect(await world.tx(login, (tx) => tx.signIns.purgeExpired(2))).toBe(2);
    expect(await world.tx(login, (tx) => tx.signIns.purgeExpired(10))).toBe(1);
    const left = await world.tx(callback, (tx) => tx.signIns.take(sha('c3'), 'S'.repeat(43)));
    expect(left).not.toBeNull();
  });

  it('refuses a second sign-in for the same cookie digest, by the key that refused it', async () => {
    await world.tx(login, (tx) => tx.signIns.save(sha('cookie'), pending()));
    await expect(
      world.tx(login, (tx) => tx.signIns.save(sha('cookie'), pending())),
    ).rejects.toEqual(new DatabaseFailure('db.constraint.auth_transactions_cookie_hash_key'));
  });

  it('accepts digests only, never a raw cookie', async () => {
    await expect(
      world.tx(login, (tx) => tx.signIns.save('raw-cookie-value', pending())),
    ).rejects.toThrow(/SHA-256/);
  });

  it('gives a sign-in to exactly one of two concurrent callbacks', async () => {
    await world.tx(login, (tx) => tx.signIns.save(sha('cookie'), pending()));
    const take = () => world.tx(callback, (tx) => tx.signIns.take(sha('cookie'), 'S'.repeat(43)));
    const results = await Promise.all([take(), take()]);
    expect(results.filter((r) => r !== null)).toHaveLength(1);
  });
});
