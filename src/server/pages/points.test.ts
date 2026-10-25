import { beforeEach, describe, expect, it, vi } from 'vitest';

import { newPointPage } from './index';

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
const TYPE_ID = '5d0c1d2e-3f40-4152-8364-758697a8b9cb';

const calledWith = () =>
  runRegistered.mock.calls[0] as [unknown, { name: string }, { input: unknown }];

beforeEach(() => {
  resolvePrincipal.mockReset();
  resolvePrincipal.mockResolvedValue({ kind: 'user', actor: { id: 'u1', role: 'submitter' } });
  runRegistered.mockReset();
});

describe('newPointPage', () => {
  const TYPES = [
    { id: TYPE_ID, name: 'Seminář' },
    { id: ID, name: 'Jiné' },
  ];
  beforeEach(() => runRegistered.mockResolvedValue({ ok: true, value: { types: TYPES } }));

  it('is null for a visitor, without asking the use case', async () => {
    resolvePrincipal.mockResolvedValue(null);
    expect(await newPointPage()).toBeNull();
    expect(runRegistered).not.toHaveBeenCalled();
  });

  it('lists the types the use case offers, in its order', async () => {
    expect(await newPointPage()).toEqual({ types: TYPES });
    expect(calledWith()[1].name).toBe('pointTypes.list');
    expect(calledWith()[2].input).toEqual({});
  });

  it('is null when the viewer may not start a point', async () => {
    runRegistered.mockResolvedValue({ ok: false, error: { code: 'forbidden' } });
    expect(await newPointPage()).toBeNull();
  });

  it('fails loudly on any other failure', async () => {
    runRegistered.mockResolvedValue({ ok: false, error: { code: 'unavailable' } });
    await expect(newPointPage()).rejects.toThrow('pointTypes.list: unavailable');
  });
});
