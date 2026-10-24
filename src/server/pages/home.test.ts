import { beforeEach, describe, expect, it, vi } from 'vitest';

import { homePage } from './index';

const resolvePrincipal = vi.hoisted(() => vi.fn<() => Promise<unknown>>(async () => null));
const runRegistered = vi.hoisted(() => vi.fn());
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('../pipeline', async () => ({
  ...(await vi.importActual<object>('../pipeline')),
  runRegistered,
}));
vi.mock('../container', () => ({
  getContainer: () => ({ resolvePrincipal, requestIdFrom: () => 'req-1' }),
}));

const as = (role: string) =>
  resolvePrincipal.mockResolvedValue({ kind: 'user', actor: { id: 'u1', role } });
const standing = (value: unknown) =>
  runRegistered.mockResolvedValue({ ok: true, value: { standing: value } });

describe('homePage', () => {
  beforeEach(() => {
    resolvePrincipal.mockReset();
    resolvePrincipal.mockResolvedValue(null);
    runRegistered.mockReset();
  });

  it('is null for a visitor', async () => {
    expect(await homePage()).toBeNull();
    expect(runRegistered).not.toHaveBeenCalled();
  });

  it('answers a member without a lookup', async () => {
    as('submitter');
    expect(await homePage()).toEqual({ kind: 'member' });
    expect(runRegistered).not.toHaveBeenCalled();
  });

  it.each([
    [{ kind: 'open', previous: null }, 'open'],
    [{ kind: 'open', previous: 'rejected' }, 'open'],
    [{ kind: 'pending', requestId: 'r', version: 1, reason: 'x', createdAt: 'y' }, 'pending'],
    [{ kind: 'cooldown', decidedAt: 'a', until: 'b' }, 'cooldown'],
    [{ kind: 'blocked', decidedAt: 'a' }, 'blocked'],
  ])('gives a waiting user only the kind of standing (%j)', async (value, kind) => {
    as('pending');
    standing(value);
    expect(await homePage()).toEqual({ kind: 'pending', standing: kind });
  });

  it.each(['forbidden', 'not-found', 'invalid-input'])('is null on %s', async (code) => {
    as('pending');
    runRegistered.mockResolvedValue({ ok: false, error: { code } });
    expect(await homePage()).toBeNull();
  });

  it('fails loudly on any other failure', async () => {
    as('pending');
    runRegistered.mockResolvedValue({ ok: false, error: { code: 'unavailable' } });
    await expect(homePage()).rejects.toThrow('access.mine: unavailable');
  });
});
