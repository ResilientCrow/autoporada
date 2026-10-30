import { beforeEach, describe, expect, it, vi } from 'vitest';

import { futureListPage, futurePage } from './index';

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

const view = (over: object = {}) => ({
  title: 'Lyžák',
  startDate: '2026-11-10',
  endDate: null,
  timeFrom: null,
  timeTo: null,
  campus: null,
  place: null,
  expectsReport: false,
  responsible: null,
  ...over,
});
const loaded = (over: object = {}) => ({
  id: ID,
  kind: 'akce',
  state: 'draft',
  version: 3,
  isAuthor: true,
  editable: true,
  view: view(),
  ...over,
});
const WINDOW = {
  submitMonday: '2026-11-09',
  issues: [{ monday: '2026-11-16', deadlineAt: '2026-11-15T17:00:00.000Z', status: 'skipped' }],
};

/** Answers the use cases the page asks for. */
const serve = (answers: { get?: unknown; list?: unknown; window?: unknown }) =>
  runRegistered.mockImplementation(async (_container: unknown, useCase: { name: string }) => {
    if (useCase.name === 'future.get') return answers.get;
    if (useCase.name === 'future.list') return answers.list;
    return answers.window ?? { ok: true, value: WINDOW };
  });
const asked = () => runRegistered.mock.calls.map((call) => (call[1] as { name: string }).name);
const input = (name: string) =>
  (
    runRegistered.mock.calls.find((call) => (call[1] as { name: string }).name === name)?.[2] as {
      input: unknown;
    }
  ).input;

beforeEach(() => {
  resolvePrincipal.mockReset();
  resolvePrincipal.mockResolvedValue({
    kind: 'user',
    actor: { id: 'u1', role: 'submitter', status: 'active', isStudent: true },
  });
  runRegistered.mockReset();
});

describe('futureListPage', () => {
  const ROW = { id: ID, title: 'Lyžák' };

  it('is null for a visitor, without asking the use case', async () => {
    resolvePrincipal.mockResolvedValue(null);
    expect(await futureListPage({})).toBeNull();
    expect(runRegistered).not.toHaveBeenCalled();
  });

  it('lists the first page and says so, for a student too', async () => {
    serve({ list: { ok: true, value: { items: [ROW], next: 'abc' } } });
    expect(await futureListPage({})).toEqual({ rows: [ROW], next: 'abc', first: true });
    expect(input('future.list')).toEqual({});
  });

  it('continues from ?pred, and a page after a cursor is not the first', async () => {
    serve({ list: { ok: true, value: { items: [], next: null } } });
    expect(await futureListPage({ pred: 'abc' })).toEqual({ rows: [], next: null, first: false });
    expect(input('future.list')).toEqual({ before: 'abc' });
  });

  it('is null where the use case refuses, a malformed cursor included (404)', async () => {
    serve({ list: { ok: false, error: { code: 'invalid-input' } } });
    expect(await futureListPage({ pred: '!' })).toBeNull();
  });

  it('fails loudly on any other failure', async () => {
    serve({ list: { ok: false, error: { code: 'unavailable' } } });
    await expect(futureListPage({})).rejects.toThrow('future.list: unavailable');
  });
});

describe('futurePage', () => {
  it('is null for a visitor, without asking anything', async () => {
    resolvePrincipal.mockResolvedValue(null);
    expect(await futurePage(ID)).toBeNull();
    expect(runRegistered).not.toHaveBeenCalled();
  });

  it('is null for an item the reader does not see', async () => {
    serve({ get: { ok: false, error: { code: 'not-found' } } });
    expect(await futurePage(ID)).toBeNull();
  });

  it('gives the author the item with the meeting calendar of the strip', async () => {
    serve({ get: { ok: true, value: loaded() } });
    expect(await futurePage(ID)).toEqual({
      id: ID,
      kind: 'akce',
      state: 'draft',
      version: 3,
      isAuthor: true,
      editable: true,
      view: view(),
      window: WINDOW,
    });
    expect(asked()).toEqual(['future.get', 'issues.window']);
    expect(input('future.get')).toEqual({ id: ID });
  });

  it.each(['draft', 'returned', 'submitted', 'approved'] as const)(
    'shows the strip to the author of a %s item',
    async (state) => {
      serve({ get: { ok: true, value: loaded({ state }) } });
      expect((await futurePage(ID))?.window).toEqual(WINDOW);
    },
  );

  it.each(['rejected', 'withdrawn', 'cancelled'] as const)(
    'reads no calendar for an item that is %s',
    async (state) => {
      serve({ get: { ok: true, value: loaded({ state }) } });
      expect((await futurePage(ID))?.window).toBeNull();
      expect(asked()).toEqual(['future.get']);
    },
  );

  it('reads no calendar for a reader who is not the author, or an item with no start date', async () => {
    serve({ get: { ok: true, value: loaded({ isAuthor: false, state: 'approved' }) } });
    expect((await futurePage(ID))?.window).toBeNull();
    serve({ get: { ok: true, value: loaded({ view: view({ startDate: null }) }) } });
    expect((await futurePage(ID))?.window).toBeNull();
    expect(asked()).toEqual(['future.get', 'future.get']);
  });

  it('leaves the strip out when the calendar is refused, which is only a convenience', async () => {
    serve({
      get: { ok: true, value: loaded() },
      window: { ok: false, error: { code: 'forbidden' } },
    });
    expect((await futurePage(ID))?.window).toBeNull();
  });
});
