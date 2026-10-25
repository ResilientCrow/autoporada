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
  resolvePrincipal.mockResolvedValue({
    kind: 'user',
    actor: { id: 'u1', role, status: 'active', isStudent: false },
  });
/** The strip of a member's model; fails the test for anything else. */
async function stripOfHome() {
  const model = await homePage();
  if (model?.kind !== 'member') throw new Error('not a member');
  return model.strip;
}
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

  it.each(['submitter', 'reviewer'])('answers a %s without a lookup or a strip', async (role) => {
    as(role);
    expect(await homePage()).toEqual({ kind: 'member', strip: null });
    expect(runRegistered).not.toHaveBeenCalled();
  });

  describe('for the one who may skip a meeting', () => {
    const row = (monday: string, status: string, version: number) => ({
      monday,
      deadlineAt: '2026-11-08T17:00:00.000Z',
      status,
      version,
    });
    const window = (submitMonday: string, issues: unknown[]) =>
      runRegistered.mockResolvedValue({ ok: true, value: { submitMonday, issues } });

    it('reads the window once and gives four Mondays from the submit Monday', async () => {
      as('headmaster');
      window('2026-11-09', []);
      const model = await homePage();
      expect(runRegistered).toHaveBeenCalledTimes(1);
      const call = runRegistered.mock.calls[0] as [unknown, { name: string }, { input: unknown }];
      expect(call[1].name).toBe('issues.window');
      expect(call[2].input).toEqual({});
      expect(model).toEqual({
        kind: 'member',
        strip: [
          { monday: '2026-11-09', label: '9. 11. 2026', status: 'open', version: null },
          { monday: '2026-11-16', label: '16. 11. 2026', status: 'open', version: null },
          { monday: '2026-11-23', label: '23. 11. 2026', status: 'open', version: null },
          { monday: '2026-11-30', label: '30. 11. 2026', status: 'open', version: null },
        ],
      });
    });

    it('takes status and version from the rows and ignores rows outside the four', async () => {
      as('headmaster');
      window('2026-11-09', [
        row('2026-11-02', 'generated', 4),
        row('2026-11-16', 'skipped', 2),
        row('2026-11-23', 'generated', 5),
        row('2026-12-07', 'skipped', 9),
      ]);
      expect(await stripOfHome()).toEqual([
        { monday: '2026-11-09', label: '9. 11. 2026', status: 'open', version: null },
        { monday: '2026-11-16', label: '16. 11. 2026', status: 'skipped', version: 2 },
        { monday: '2026-11-23', label: '23. 11. 2026', status: 'generated', version: 5 },
        { monday: '2026-11-30', label: '30. 11. 2026', status: 'open', version: null },
      ]);
    });

    it('follows a submit Monday across the year end', async () => {
      as('headmaster');
      window('2026-12-28', []);
      const strip = await stripOfHome();
      expect(strip?.map((day) => day.monday)).toEqual([
        '2026-12-28',
        '2027-01-04',
        '2027-01-11',
        '2027-01-18',
      ]);
      expect(strip?.[1]?.label).toBe('4. 1. 2027');
    });

    it.each(['forbidden', 'not-found', 'invalid-input'])('is null on %s', async (code) => {
      as('headmaster');
      runRegistered.mockResolvedValue({ ok: false, error: { code } });
      expect(await homePage()).toBeNull();
    });

    it('fails loudly on any other failure', async () => {
      as('headmaster');
      runRegistered.mockResolvedValue({ ok: false, error: { code: 'unavailable' } });
      await expect(homePage()).rejects.toThrow('issues.window: unavailable');
    });

    it('gives a headmaster who is a student no strip and no lookup', async () => {
      resolvePrincipal.mockResolvedValue({
        kind: 'user',
        actor: { id: 'u1', role: 'headmaster', status: 'active', isStudent: true },
      });
      expect(await homePage()).toEqual({ kind: 'member', strip: null });
      expect(runRegistered).not.toHaveBeenCalled();
    });
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
