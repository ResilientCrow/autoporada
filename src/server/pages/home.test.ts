import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_DEADLINE } from '@/domain/calendar';
import { POINT_TYPES } from '@/domain/report';

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
    log: { error: () => undefined },
    app: { clock: { now: () => NOW } },
  }),
}));

/** The instant the page is made at. */
const NOW = new Date('2026-11-03T10:00:00.000Z');
/** The deadline rule `issues.window` carries: the default, as text. */
const RULE = { dayOffset: -2, time: '20:00' };

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
const emptyQueue = { ok: true, value: { mondays: [], approved: [], more: false } };
/** Answers the use cases the page asks for: the meeting calendar, the author's list and the review queue. */
const serve = (answers: {
  window?: unknown;
  list?: unknown;
  queue?: unknown;
  future?: unknown;
  tally?: unknown;
}) =>
  runRegistered.mockImplementation(async (_container: unknown, useCase: { name: string }) => {
    if (useCase.name === 'points.queue') return answers.queue ?? emptyQueue;
    if (useCase.name === 'future.owedReports') {
      return answers.future ?? { ok: true, value: { items: [] } };
    }
    if (useCase.name === 'issues.reportTally') {
      return answers.tally ?? { ok: true, value: { porada: null } };
    }
    return useCase.name === 'issues.window' ? answers.window : (answers.list ?? noPoints);
  });
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

  describe('the card of akce waiting for a report', () => {
    const due = {
      id: 'a',
      title: 'Výlet',
      startDate: '2026-11-01',
      endDate: null,
      timeFrom: null,
      timeTo: null,
      monday: '2026-11-09',
      meetingDate: '2026-11-09',
      closesAt: '2026-11-07T19:00:00.000Z',
      report: null,
    };

    it('lists the akce of an author that wait for it, with the types to choose from', async () => {
      as('submitter');
      serve({
        window: {
          ok: true,
          value: {
            submitMonday: '2026-11-09',
            stripFrom: '2026-11-09',
            issues: [],
            rule: RULE,
            plannedThrough: '2026-11-02',
          },
        },
        future: { ok: true, value: { items: [due] } },
      });
      const model = await homePage();
      expect(model).toMatchObject({
        kind: 'member',
        reportDue: {
          items: [{ id: 'a', title: 'Výlet' }],
          types: POINT_TYPES.map(({ id, name }) => ({ id, name })),
        },
      });
    });
  });

  describe('for the one who may skip a meeting', () => {
    const row = (monday: string, status: string, version: number) => ({
      monday,
      meetingDate: monday,
      deadlineAt: '2026-11-08T17:00:00.000Z',
      status,
      version,
    });
    const window = (
      submitMonday: string,
      issues: unknown[],
      plannedThrough = '2026-11-02',
      stripFrom = submitMonday,
    ) =>
      serve({
        window: {
          ok: true,
          value: { submitMonday, stripFrom, issues, rule: RULE, plannedThrough },
        },
      });

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
        row('2026-11-16', 'open', 2),
        row('2026-11-23', 'generated', 5),
        row('2026-12-07', 'open', 9),
      ]);
      expect(await stripOfHome()).toEqual([
        { monday: '2026-11-09', label: '9. 11. 2026', held: null, status: 'open', version: null },
        { monday: '2026-11-16', label: '16. 11. 2026', held: null, status: 'open', version: 2 },
        {
          monday: '2026-11-23',
          label: '23. 11. 2026',
          held: null,
          status: 'generated',
          version: 5,
        },
        { monday: '2026-11-30', label: '30. 11. 2026', held: null, status: 'open', version: null },
      ]);
    });

    it('leaves out a Monday with no row up to plannedThrough: it holds no porada', async () => {
      as('headmaster');
      window('2026-11-09', [row('2026-11-16', 'open', 2)], '2026-11-23');
      expect((await stripOfHome())?.map((day) => day.monday)).toEqual([
        '2026-11-16',
        '2026-11-30',
        '2026-12-07',
        '2026-12-14',
      ]);
    });

    it('starts at the first porada whose deadline is ahead, a generated one included', async () => {
      as('headmaster');
      // The 9th has closed on 8 November 17:00 UTC but NOW is 3 November: it is ahead, and generated.
      window('2026-11-16', [row('2026-11-09', 'generated', 3)]);
      expect(await stripOfHome()).toMatchObject([
        { monday: '2026-11-09', status: 'generated', version: 3 },
        { monday: '2026-11-16', status: 'open', version: null },
        { monday: '2026-11-23' },
        { monday: '2026-11-30' },
      ]);
    });

    it('gives the headmaster the calendar „Přidat poradu“ plans on', async () => {
      as('headmaster');
      window('2026-11-09', [row('2026-11-16', 'open', 2)], '2026-11-23');
      const model = await homePage();
      expect(model).toMatchObject({
        kind: 'member',
        calendar: {
          now: NOW.toISOString(),
          rule: expect.anything() as unknown,
          plannedThrough: '2026-11-23',
          issues: [expect.objectContaining({ monday: '2026-11-16' })],
        },
      });
    });

    // Row 35: a porada moved to another day is labelled by its meeting, and says when it is held.
    it('labels a moved porada by its meeting date and names the day it is held', async () => {
      as('headmaster');
      window('2026-11-09', [{ ...row('2026-11-16', 'open', 2), meetingDate: '2026-11-18' }]);
      const moved = (await stripOfHome())?.[1];
      expect(moved).toMatchObject({ monday: '2026-11-16', label: '18. 11. 2026', version: 2 });
      // The row’s deadline, 8 November 2026 at 17:00 UTC, is Sunday 18:00 in Prague.
      expect(moved?.held).toEqual({ weekday: 'neděle', date: '8.\u00a011.', time: '18:00' });
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
    const WINDOW = {
      ok: true,
      value: {
        submitMonday: '2026-11-09',
        stripFrom: '2026-11-09',
        issues: [],
        rule: RULE,
        plannedThrough: '2026-11-02',
      },
    };
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
      expect(askedFor().sort()).toEqual(['future.owedReports', 'issues.window', 'points.listMine']);
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
        plannedThrough: '2026-11-02',
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
        expect(await homePage()).toEqual({
          kind: 'member',
          strip: null,
          calendar: null,
          mine: null,
          queue: null,
          reportDue: {
            items: [],
            types: POINT_TYPES.map(({ id, name }) => ({ id, name })),
          },
          reportTally: null,
        });
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

  describe('the „Ke kontrole“ card', () => {
    const WINDOW = {
      ok: true,
      value: {
        submitMonday: '2026-11-09',
        stripFrom: '2026-11-09',
        issues: [],
        rule: RULE,
        plannedThrough: '2026-11-02',
      },
    };
    const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i}` }));
    const QUEUE = {
      ok: true,
      value: {
        mondays: [
          {
            monday: '2026-11-09',
            kinds: [
              { kind: 'report', points: rows(2) },
              { kind: 'pokyn', points: rows(1) },
            ],
          },
          { monday: '2026-11-16', kinds: [{ kind: 'finance', points: rows(1) }] },
        ],
        approved: rows(5),
        more: false,
      },
    };
    const queueOf = async () => {
      const model = await homePage();
      if (model?.kind !== 'member') throw new Error('not a member');
      return model.queue;
    };

    it.each(['reviewer', 'headmaster'])(
      'counts for a %s the points waiting for a decision, not the approved ones',
      async (role) => {
        as(role);
        serve({ window: WINDOW, queue: QUEUE });
        expect(await queueOf()).toBe(4);
        const call = runRegistered.mock.calls.find(
          (c) => (c[1] as { name: string }).name === 'points.queue',
        ) as [unknown, unknown, { input: unknown }];
        expect(call[2].input).toEqual({});
      },
    );

    it('counts zero for an empty queue', async () => {
      as('reviewer');
      serve({ window: WINDOW });
      expect(await queueOf()).toBe(0);
    });

    it('is not there for a submitter, and the queue is not asked for', async () => {
      as('submitter');
      serve({ window: WINDOW, queue: QUEUE });
      expect(await queueOf()).toBeNull();
      expect(askedFor()).not.toContain('points.queue');
    });

    it.each(['forbidden', 'not-found'])(
      'is not there when the queue is refused (%s), and the page still answers',
      async (code) => {
        as('reviewer');
        serve({ window: WINDOW, queue: { ok: false, error: { code } } });
        expect(await homePage()).toMatchObject({ kind: 'member', queue: null, mine: {} });
      },
    );

    it('fails loudly on any other failure of the queue', async () => {
      as('reviewer');
      serve({ window: WINDOW, queue: { ok: false, error: { code: 'unavailable' } } });
      await expect(homePage()).rejects.toThrow('points.queue: unavailable');
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

  describe('the headmaster’s count of missing akce reports', () => {
    const window = {
      ok: true,
      value: {
        submitMonday: '2026-11-09',
        stripFrom: '2026-11-09',
        issues: [],
        rule: RULE,
        plannedThrough: '2026-11-02',
      },
    };
    const porada = { monday: '2026-11-09', meetingDate: '2026-11-09', owed: 3, missing: 2 };

    it('carries the working porada’s count for the headmaster', async () => {
      as('headmaster');
      serve({ window, tally: { ok: true, value: { porada } } });
      expect(await homePage()).toMatchObject({ kind: 'member', reportTally: porada });
    });

    it.each(['reviewer', 'submitter'])('does not ask for a %s', async (role) => {
      as(role);
      serve({ window, tally: { ok: true, value: { porada } } });
      expect(await homePage()).toMatchObject({ reportTally: null });
      expect(askedFor()).not.toContain('issues.reportTally');
    });

    it.each(['forbidden', 'not-found'])(
      'is left out when the read is refused (%s)',
      async (code) => {
        as('headmaster');
        serve({ window, tally: { ok: false, error: { code } } });
        expect(await homePage()).toMatchObject({ kind: 'member', reportTally: null });
      },
    );
  });
});
