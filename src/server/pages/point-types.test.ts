import { beforeEach, describe, expect, it, vi } from 'vitest';

import { pointTypesPage } from './index';

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

const ID = '0b0c1d2e-3f40-4152-8364-758697a8b9ca';
const DETAIL = {
  titleGender: 'f',
  defaultBullets: [],
  active: false,
  locked: false,
  position: 2,
  version: 3,
} as const;

const asHeadmaster = () =>
  resolvePrincipal.mockResolvedValue({
    kind: 'user',
    actor: { id: 'u1', role: 'headmaster', status: 'active', isStudent: false },
  });

beforeEach(() => {
  resolvePrincipal.mockReset();
  resolvePrincipal.mockResolvedValue(null);
  runRegistered.mockReset();
});

describe('pointTypesPage', () => {
  it('is null for a visitor, without asking the use case', async () => {
    expect(await pointTypesPage()).toBeNull();
    expect(runRegistered).not.toHaveBeenCalled();
  });

  it('asks for every type, retired ones too, and flattens each with its settings', async () => {
    asHeadmaster();
    runRegistered.mockResolvedValue({
      ok: true,
      value: { types: [{ id: ID, name: 'Soutěž', detail: DETAIL }] },
    });
    expect(await pointTypesPage()).toEqual({ types: [{ id: ID, name: 'Soutěž', ...DETAIL }] });
    expect(
      runRegistered.mock.calls.map((call) => [
        (call[1] as { name: string }).name,
        (call[2] as { input: unknown }).input,
      ]),
    ).toEqual([['pointTypes.list', { includeInactive: true }]]);
  });

  it('leaves out a row that came without its settings', async () => {
    asHeadmaster();
    runRegistered.mockResolvedValue({ ok: true, value: { types: [{ id: ID, name: 'Soutěž' }] } });
    expect(await pointTypesPage()).toEqual({ types: [] });
  });

  it('is null when the use case refuses the viewer', async () => {
    asHeadmaster();
    runRegistered.mockResolvedValue({ ok: false, error: { code: 'forbidden' } });
    expect(await pointTypesPage()).toBeNull();
  });
});
