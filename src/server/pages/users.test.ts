import { beforeEach, describe, expect, it, vi } from 'vitest';

import { usersPage } from './index';

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

const LIST = { users: [], total: 0 };
const PENDING = { items: [] as unknown[] };
const answer = (useCase: { name: string }) => ({
  ok: true,
  value: useCase.name === 'access.pending' ? PENDING : LIST,
});
const listCall = () =>
  runRegistered.mock.calls.find((call) => (call[1] as { name: string }).name === 'users.list');
const inputOf = (): unknown => (listCall()?.[2] as { input: unknown }).input;

describe('usersPage', () => {
  beforeEach(() => {
    resolvePrincipal.mockReset();
    resolvePrincipal.mockResolvedValue({ kind: 'user', actor: { id: 'u1', role: 'headmaster' } });
    runRegistered.mockReset();
    runRegistered.mockImplementation(async (_deps: unknown, useCase: { name: string }) =>
      answer(useCase),
    );
    PENDING.items = [];
  });

  it('is null for a visitor, without asking the use case', async () => {
    resolvePrincipal.mockResolvedValue(null);
    expect(await usersPage({})).toBeNull();
    expect(runRegistered).not.toHaveBeenCalled();
  });

  it('asks for everyone by default and returns the list with the params used', async () => {
    expect(await usersPage({})).toEqual({ ...LIST, queue: [], q: '', group: 'all' });
    expect(inputOf()).toEqual({ group: 'all' });
  });

  it.each([
    ['vsichni', 'all'],
    ['cekajici', 'pending'],
    ['prispevatele', 'submitter'],
    ['kontrolori', 'reviewer'],
    ['reditele', 'headmaster'],
    ['neaktivni', 'inactive'],
    ['jine', 'all'],
    ['', 'all'],
    [undefined, 'all'],
    [['reditele', 'neaktivni'], 'headmaster'],
  ])('reads skupina %j as %s', async (skupina, group) => {
    const model = await usersPage({ skupina });
    expect(model?.group).toBe(group);
    expect(inputOf()).toEqual({ group });
  });

  it.each([
    ['  Novák  ', 'Novák'],
    ['   ', ''],
    [undefined, ''],
    [['a', 'b'], 'a'],
    ['x'.repeat(100), 'x'.repeat(100)],
    ['x'.repeat(101), ''],
  ])('reads hledat %j as %j', async (hledat, q) => {
    const model = await usersPage({ hledat });
    expect(model?.q).toBe(q);
    expect(inputOf()).toEqual(q === '' ? { group: 'all' } : { group: 'all', q });
  });

  it.each(['forbidden', 'not-found', 'invalid-input'])('is null on %s', async (code) => {
    runRegistered.mockResolvedValue({ ok: false, error: { code } });
    expect(await usersPage({})).toBeNull();
  });

  it('is null when only the queue is refused', async () => {
    runRegistered.mockImplementation(async (_deps: unknown, useCase: { name: string }) =>
      useCase.name === 'access.pending'
        ? { ok: false, error: { code: 'forbidden' } }
        : answer(useCase),
    );
    expect(await usersPage({})).toBeNull();
  });

  it('carries the queue, with the day asked written out in Prague time', async () => {
    // 23:30 UTC on 30 September is 1 October in Prague (summer time).
    PENDING.items = [
      {
        requestId: 'r1',
        version: 2,
        userId: 'u9',
        displayName: 'Jana Nová',
        email: 'jana@skola.example',
        jobTitle: 'Učitelka',
        department: null,
        reason: 'Chci posílat zprávy',
        requestedAt: '2026-09-30T23:30:00.000Z',
        events: ['approve', 'reject'],
      },
    ];
    expect((await usersPage({}))?.queue).toEqual([
      {
        requestId: 'r1',
        userId: 'u9',
        version: 2,
        displayName: 'Jana Nová',
        jobTitle: 'Učitelka',
        department: null,
        reason: 'Chci posílat zprávy',
        events: ['approve', 'reject'],
        submitted: '1. října 2026',
      },
    ]);
  });

  it('fails loudly on any other failure', async () => {
    runRegistered.mockResolvedValue({ ok: false, error: { code: 'unavailable' } });
    await expect(usersPage({})).rejects.toThrow('unavailable');
  });
});
