import { beforeEach, describe, expect, it, vi } from 'vitest';

import { accessPage } from './index';

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

const standing = (value: unknown) =>
  runRegistered.mockResolvedValue({ ok: true, value: { standing: value } });

describe('accessPage', () => {
  beforeEach(() => {
    resolvePrincipal.mockReset();
    resolvePrincipal.mockResolvedValue({ kind: 'user', actor: { id: 'u1', role: 'pending' } });
    runRegistered.mockReset();
  });

  it('is null for a visitor, without asking the use case', async () => {
    resolvePrincipal.mockResolvedValue(null);
    expect(await accessPage()).toBeNull();
    expect(runRegistered).not.toHaveBeenCalled();
  });

  it('passes a member and an open standing through', async () => {
    standing({ kind: 'member' });
    expect(await accessPage()).toEqual({ kind: 'member' });
    standing({ kind: 'open', previous: 'cancelled' });
    expect(await accessPage()).toEqual({ kind: 'open', previous: 'cancelled' });
  });

  it('writes the sent date out, in Prague time, and keeps the reason', async () => {
    // 23:30 UTC on 30 September is 1 October in Prague (summer time).
    standing({
      kind: 'pending',
      requestId: 'r1',
      version: 1,
      reason: 'Chci posílat zprávy',
      createdAt: '2026-09-30T23:30:00.000Z',
    });
    expect(await accessPage()).toEqual({
      kind: 'pending',
      sent: '1. října 2026',
      reason: 'Chci posílat zprávy',
    });
  });

  it('writes out the decision and the day a new request can be made from', async () => {
    standing({
      kind: 'cooldown',
      decidedAt: '2026-10-01T08:00:00.000Z',
      until: '2026-10-31T22:30:00.000Z',
    });
    expect(await accessPage()).toEqual({
      kind: 'cooldown',
      decided: '1. října 2026',
      from: '31. října 2026',
    });
  });

  it('shows a block without a date', async () => {
    standing({ kind: 'blocked', decidedAt: '2026-10-01T08:00:00.000Z' });
    expect(await accessPage()).toEqual({ kind: 'blocked' });
  });

  it.each(['forbidden', 'not-found', 'invalid-input'])('is null on %s', async (code) => {
    runRegistered.mockResolvedValue({ ok: false, error: { code } });
    expect(await accessPage()).toBeNull();
  });

  it('fails loudly on any other failure', async () => {
    runRegistered.mockResolvedValue({ ok: false, error: { code: 'unavailable' } });
    await expect(accessPage()).rejects.toThrow('access.mine: unavailable');
  });
});
