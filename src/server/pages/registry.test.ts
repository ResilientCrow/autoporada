import { beforeEach, describe, expect, it, vi } from 'vitest';

import { newYearPage, registryPage } from './index';

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
    // Wednesday 9 Sep 2026: inside the school year 2026/2027.
    app: { clock: { now: () => new Date('2026-09-09T10:00:00.000Z') } },
  }),
}));

const asRole = (role: string) =>
  resolvePrincipal.mockResolvedValue({
    kind: 'user',
    actor: { id: 'u1', role, status: 'active', isStudent: false },
  });

const LIST = { id: '0b0c1d2e-3f40-4152-8364-758697a8b9ca', key: 'aj-certifikat', title: 'AJ' };
const READ = { lists: [{ ...LIST, entries: 4, fresh: 1 }], current: null };

beforeEach(() => {
  resolvePrincipal.mockReset();
  resolvePrincipal.mockResolvedValue(null);
  runRegistered.mockReset();
  runRegistered.mockResolvedValue({ ok: true, value: READ });
});

describe('registryPage', () => {
  it('is null for a visitor, without asking the use case', async () => {
    expect(await registryPage()).toBeNull();
    expect(runRegistered).not.toHaveBeenCalled();
  });

  it('lets the headmaster edit and a reviewer only read', async () => {
    asRole('headmaster');
    expect((await registryPage())?.canEdit).toBe(true);
    asRole('reviewer');
    const page = await registryPage();
    expect(page?.canEdit).toBe(false);
    expect(page?.lists).toEqual(READ.lists);
  });

  it('is null where the use case refuses (a submitter or a student)', async () => {
    asRole('submitter');
    runRegistered.mockResolvedValue({ ok: false, error: { code: 'forbidden' } });
    expect(await registryPage()).toBeNull();
  });

  it('passes the key on, and none when there is none', async () => {
    asRole('headmaster');
    await registryPage();
    await registryPage('aj-certifikat');
    const inputs = runRegistered.mock.calls.map((call) => (call[2] as { input: unknown }).input);
    expect(inputs).toEqual([{}, { key: 'aj-certifikat' }]);
  });

  it('is null for an unknown key', async () => {
    asRole('headmaster');
    runRegistered.mockResolvedValue({ ok: false, error: { code: 'not-found' } });
    expect(await registryPage('nope')).toBeNull();
  });
});

describe('newYearPage', () => {
  it('is null for a visitor and for a reviewer, who may read the registry', async () => {
    expect(await newYearPage()).toBeNull();
    asRole('reviewer');
    expect(await newYearPage()).toBeNull();
  });

  it('gives the headmaster the lists and the years to archive under', async () => {
    asRole('headmaster');
    const page = await newYearPage();
    expect(page?.lists).toEqual(READ.lists);
    expect(page?.years.options).toContain(page?.years.initial);
  });
});
