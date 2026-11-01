import { beforeEach, describe, expect, it, vi } from 'vitest';

import { userPage } from './index';

const resolvePrincipal = vi.hoisted(() => vi.fn<() => Promise<unknown>>(async () => null));
const runRegistered = vi.hoisted(() => vi.fn());
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('../pipeline', async () => ({
  ...(await vi.importActual<object>('../pipeline')),
  runRegistered,
}));
vi.mock('../container', () => ({
  getContainer: () => ({
    resolvePrincipal,
    requestIdFrom: () => 'req-1',
    log: { error: () => undefined },
  }),
}));

const ID = '0b0c1d2e-3f40-4152-8364-758697a8b9ca';
const LOADED = {
  user: {
    id: ID,
    displayName: 'Jana Nová',
    email: 'jana@skola.example',
    jobTitle: null,
    department: null,
    role: 'pending',
    status: 'active',
    isStudent: false,
    version: 3,
    // 23:30 UTC on 30 September is 1 October in Prague (summer time).
    createdAt: '2026-09-30T23:30:00.000Z',
  },
  isSelf: false,
  choices: { roles: ['submitter'], audience: true, statuses: ['blocked'] },
  request: {
    requestId: 'r1',
    version: 2,
    state: 'rejected',
    reason: 'Chci posílat zprávy',
    createdAt: '2026-10-02T08:00:00.000Z',
    decidedAt: '2026-10-03T08:00:00.000Z',
  },
  requestEvents: ['block'],
};

describe('userPage', () => {
  beforeEach(() => {
    resolvePrincipal.mockReset();
    resolvePrincipal.mockResolvedValue({ kind: 'user', actor: { id: 'u1', role: 'headmaster' } });
    runRegistered.mockReset();
    runRegistered.mockResolvedValue({ ok: true, value: LOADED });
  });

  it('is null for a visitor, without asking the use case', async () => {
    resolvePrincipal.mockResolvedValue(null);
    expect(await userPage(ID)).toBeNull();
    expect(runRegistered).not.toHaveBeenCalled();
  });

  it('asks for the user by id', async () => {
    await userPage(ID);
    expect((runRegistered.mock.calls[0]?.[2] as { input: unknown }).input).toEqual({ userId: ID });
  });

  it('writes the dates out in Prague time and passes the rest through', async () => {
    const model = await userPage(ID);
    expect(model?.user).toMatchObject({ id: ID, displayName: 'Jana Nová', version: 3 });
    expect(model?.user.since).toBe('1. října 2026');
    expect(model?.user).not.toHaveProperty('createdAt');
    expect(model?.request).toEqual({
      requestId: 'r1',
      version: 2,
      state: 'rejected',
      reason: 'Chci posílat zprávy',
      submitted: '2. října 2026',
      decided: '3. října 2026',
    });
    expect(model?.isSelf).toBe(false);
    expect(model?.choices).toEqual(LOADED.choices);
    expect(model?.requestEvents).toEqual(['block']);
  });

  it('has no decision date for a request still waiting, and no request for a user without one', async () => {
    runRegistered.mockResolvedValue({
      ok: true,
      value: { ...LOADED, request: { ...LOADED.request, state: 'pending', decidedAt: null } },
    });
    expect((await userPage(ID))?.request?.decided).toBeNull();
    runRegistered.mockResolvedValue({ ok: true, value: { ...LOADED, request: null } });
    expect((await userPage(ID))?.request).toBeNull();
  });

  it.each(['forbidden', 'not-found', 'invalid-input'])('is null on %s', async (code) => {
    runRegistered.mockResolvedValue({ ok: false, error: { code } });
    expect(await userPage('nonsense')).toBeNull();
  });

  it('fails loudly on any other failure', async () => {
    runRegistered.mockResolvedValue({ ok: false, error: { code: 'unavailable' } });
    await expect(userPage(ID)).rejects.toThrow('users.get: unavailable');
  });
});
