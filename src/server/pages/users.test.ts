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
const inputOf = (): unknown => (runRegistered.mock.calls[0]?.[2] as { input: unknown }).input;

describe('usersPage', () => {
  beforeEach(() => {
    resolvePrincipal.mockReset();
    resolvePrincipal.mockResolvedValue({ kind: 'user', actor: { id: 'u1', role: 'headmaster' } });
    runRegistered.mockReset();
    runRegistered.mockResolvedValue({ ok: true, value: LIST });
  });

  it('is null for a visitor, without asking the use case', async () => {
    resolvePrincipal.mockResolvedValue(null);
    expect(await usersPage({})).toBeNull();
    expect(runRegistered).not.toHaveBeenCalled();
  });

  it('asks for everyone by default and returns the list with the params used', async () => {
    expect(await usersPage({})).toEqual({ ...LIST, q: '', group: 'all' });
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

  it('fails loudly on any other failure', async () => {
    runRegistered.mockResolvedValue({ ok: false, error: { code: 'unavailable' } });
    await expect(usersPage({})).rejects.toThrow('users.list: unavailable');
  });
});
