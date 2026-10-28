import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_DEADLINE } from '@/domain/calendar';

import { homePage } from './index';

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
    app: { clock: { now: () => NOW } },
  }),
}));

/** The instant the page is made at. */
const NOW = new Date('2026-11-03T10:00:00.000Z');

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
const noPoints = { ok: true, value: { points: [], next: null } };
const summary = (state: string) => ({ id: `p-${state}`, state, title: 'x' });
/** Answers the use cases the page asks for: the meeting calendar and the author's list. */
const serve = (answers: { window?: unknown; list?: unknown }) =>
  runRegistered.mockImplementation(async (_container: unknown, useCase: { name: string }) =>
    useCase.name === 'issues.window' ? answers.window : (answers.list ?? noPoints),
  );
const askedFor = () => runRegistered.mock.calls.map((call) => (call[1] as { name: string }).name);
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

  it.each(['pending'])('keeps %s users to their access lookup', async (role) => {
    as(role);
    standing({ kind: 'open', previous: null });
    await homePage();
    expect(askedFor()).toEqual(['access.mine']);
  });

  describe('for the one who may skip a meeting', () => {
    const row = (monday: string, status: string, version: number) => ({
      monday,
      deadlineAt: '2026-11-08T17:00:00.000Z',
      status,
      version,
    });
    const window = (submitMonday: string, issues: unknown[]) =>
      serve({ window: { ok: true, value: { submitMonday, issues } } });

    it('reads the window once and gives four Mondays from the submit Monday', async () => {
      as('headmaster');
      window('2026-11-09', []);
      const model = await homePage();
      expect(askedFor().filter((name) => name === 'issues.window')).toHaveLength(1);
      const call = runRegistered.mock.calls.find(
        (c) => (c[1] as { name: string }).name === 'issues.window',
      ) as [unknown, unknown, { input: unknown }];
      expect(call[2].input).toEqual({});
      expect(model).toMatchObject({
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

    it('gives a headmaster who is a student no strip, only the card', async () => {
      resolvePrincipal.mockResolvedValue({
        kind: 'user',
        actor: { id: 'u1', role: 'headmaster', status: 'active', isStudent: true },
      });
      window('2026-11-09', []);
      expect(await homePage()).toMatchObject({ kind: 'member', strip: null, mine: { counts: {} } });
    });
  });

  describe('the „Moje body“ card', () => {
    const WINDOW = { ok: true, value: { submitMonday: '2026-11-09', issues: [] } };
    const mineOf = async () => {
      const model = await homePage();
      if (model?.kind !== 'member') throw new Error('not a member');
      return model.mine;
    };
    const list = (states: string[], next: string | null = null) => ({
      ok: true,
      value: { points: states.map(summary), next },
    });

    it.each(['submitter', 'reviewer', 'headmaster'])('is there for a %s', async (role) => {
      as(role);
      serve({ window: WINDOW, list: list(['draft']) });
      expect(await mineOf()).not.toBeNull();
    });

    it('counts the author’s points by state, every state present', async () => {
      as('submitter');
      serve({
        window: WINDOW,
        list: list(['draft', 'draft', 'returned', 'approved', 'rejected', 'published']),
      });
      expect((await mineOf())?.counts).toEqual({
        draft: 2,
        submitted: 0,
        returned: 1,
        approved: 1,
        rejected: 1,
        withdrawn: 0,
        published: 1,
      });
    });

    it('counts zero everywhere for an author with no points', async () => {
      as('submitter');
      serve({ window: WINDOW });
      expect(Object.values((await mineOf())?.counts ?? {})).toEqual([0, 0, 0, 0, 0, 0, 0]);
    });

    it('asks for the first page of the list and for the window, as the viewer, with no input', async () => {
      as('submitter');
      serve({ window: WINDOW, list: list([]) });
      await homePage();
      expect(askedFor().sort()).toEqual(['issues.window', 'points.listMine']);
      for (const call of runRegistered.mock.calls) {
        expect((call[2] as { input: unknown }).input).toEqual({});
      }
    });

    it('hands over the window, now and the deadline rule for the standing line', async () => {
      as('submitter');
      serve({ window: WINDOW, list: list([]) });
      expect((await mineOf())?.standing).toEqual({
        submitMonday: '2026-11-09',
        issues: [],
        now: NOW.toISOString(),
        rule: DEFAULT_DEADLINE,
      });
    });

    it('reads the window once when the strip needs it too', async () => {
      as('headmaster');
      serve({ window: WINDOW, list: list(['draft']) });
      const model = await homePage();
      expect(askedFor().filter((name) => name === 'issues.window')).toHaveLength(1);
      expect(model).toMatchObject({
        strip: expect.any(Array) as unknown,
        mine: { standing: { submitMonday: '2026-11-09' } },
      });
    });

    it.each(['forbidden', 'not-found'])(
      'has the card without a standing line when the calendar is refused (%s)',
      async (code) => {
        as('submitter');
        serve({ window: { ok: false, error: { code } }, list: list(['draft']) });
        expect(await mineOf()).toMatchObject({ standing: null, counts: { draft: 1 } });
      },
    );

    it.each(['forbidden', 'not-found'])(
      'has no card when the list is refused (%s), and the page still answers',
      async (code) => {
        as('submitter');
        serve({ window: WINDOW, list: { ok: false, error: { code } } });
        expect(await homePage()).toEqual({ kind: 'member', strip: null, mine: null });
      },
    );

    it('fails loudly on any other failure of the list or the calendar', async () => {
      as('submitter');
      serve({ window: WINDOW, list: { ok: false, error: { code: 'unavailable' } } });
      await expect(homePage()).rejects.toThrow('points.listMine: unavailable');
      serve({ window: { ok: false, error: { code: 'unavailable' } } });
      await expect(homePage()).rejects.toThrow('issues.window: unavailable');
    });

    it('is not there for a pending user, who has no list to ask for', async () => {
      as('pending');
      standing({ kind: 'open', previous: null });
      expect(await homePage()).toEqual({ kind: 'pending', standing: 'open' });
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
