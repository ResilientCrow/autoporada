import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { UserPrincipal } from '@/application/ports';

import { reportDueOf } from './report-due';

const runRegistered = vi.hoisted(() => vi.fn());
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('../pipeline', async () => ({
  ...(await vi.importActual<object>('../pipeline')),
  runRegistered,
}));
vi.mock('../container', () => ({
  // 12 November, 11:00 in Prague.
  getContainer: () => ({
    requestIdFrom: () => 'req-1',
    app: { clock: { now: () => new Date('2026-11-12T10:00:00Z') } },
  }),
}));

const viewer = (role: string): UserPrincipal =>
  ({
    kind: 'user',
    actor: { id: 'u1', role, status: 'active', isStudent: false },
  }) as UserPrincipal;

const row = (id: string, over: object = {}) => ({
  id,
  kind: 'akce',
  state: 'approved',
  isAuthor: true,
  title: `Akce ${id}`,
  startDate: '2026-11-10',
  endDate: '2026-11-11',
  timeFrom: null,
  timeTo: null,
  campus: null,
  place: null,
  expectsReport: true,
  reportState: 'none',
  responsible: null,
  updatedAt: '2026-11-01T08:00:00.000Z',
  ...over,
});
const TYPES = [
  { id: 't1', name: 'Seminář', detail: null },
  { id: 't2', name: 'Exkurze', detail: null },
];

/** Answers the two use cases the loader asks for. */
const serve = (items: unknown[], types: unknown = { ok: true, value: { types: TYPES } }) =>
  runRegistered.mockImplementation(async (_container: unknown, useCase: { name: string }) =>
    useCase.name === 'future.list' ? { ok: true, value: { items, next: null } } : types,
  );
const idsOf = async () => (await reportDueOf(viewer('submitter')))?.items.map((i) => i.id);

describe('reportDueOf', () => {
  beforeEach(() => {
    runRegistered.mockReset();
  });

  it('lists the author’s approved akce that wait for a report, with the types to write it on', async () => {
    serve([row('a')]);
    expect(await reportDueOf(viewer('submitter'))).toEqual({
      items: [
        {
          id: 'a',
          title: 'Akce a',
          startDate: '2026-11-10',
          endDate: '2026-11-11',
          timeFrom: null,
          timeTo: null,
        },
      ],
      types: [
        { id: 't1', name: 'Seminář' },
        { id: 't2', name: 'Exkurze' },
      ],
    });
  });

  it('asks for the first page of the list and the active types, as the viewer', async () => {
    serve([]);
    const who = viewer('submitter');
    await reportDueOf(who);
    const calls = runRegistered.mock.calls as [
      unknown,
      { name: string },
      { input: unknown; principal: unknown },
    ][];
    expect(calls.map(([, useCase]) => useCase.name).sort()).toEqual([
      'future.list',
      'pointTypes.list',
    ]);
    expect(calls.map(([, , call]) => call.input)).toEqual([{}, {}]);
    expect(calls.every(([, , call]) => call.principal === who)).toBe(true);
  });

  it('is due from the day after the last day, counting a one-day akce by its start', async () => {
    serve([
      row('over'),
      row('today', { endDate: '2026-11-12' }),
      row('tomorrow', { endDate: '2026-11-13' }),
      row('oneday', { startDate: '2026-11-11', endDate: null }),
      row('onedaytoday', { startDate: '2026-11-12', endDate: null }),
    ]);
    expect(await idsOf()).toEqual(['over', 'oneday']);
  });

  it('keeps a prompted akce and drops the ones whose report is written or declined', async () => {
    serve([
      row('prompted', { reportState: 'prompted' }),
      row('written', { reportState: 'written' }),
      row('declined', { reportState: 'declined' }),
    ]);
    expect(await idsOf()).toEqual(['prompted']);
  });

  it('drops what is not the viewer’s own approved akce that expects a report', async () => {
    serve([
      row('others', { isAuthor: false }),
      row('submitted', { state: 'submitted' }),
      row('cancelled', { state: 'cancelled' }),
      row('none', { expectsReport: false }),
      row('undated', { startDate: null, endDate: null }),
    ]);
    expect(await idsOf()).toEqual([]);
  });

  it('keeps the card with no items so that it can say a decision went through', async () => {
    serve([]);
    expect(await reportDueOf(viewer('submitter'))).toEqual({
      items: [],
      types: [
        { id: 't1', name: 'Seminář' },
        { id: 't2', name: 'Exkurze' },
      ],
    });
  });

  it('is null for whoever may not start items, without asking', async () => {
    expect(await reportDueOf(viewer('pending'))).toBeNull();
    expect(runRegistered).not.toHaveBeenCalled();
  });

  it.each(['forbidden', 'not-found', 'invalid-input'])(
    'is null when a read is refused (%s)',
    async (code) => {
      serve([row('a')], { ok: false, error: { code } });
      expect(await reportDueOf(viewer('submitter'))).toBeNull();
    },
  );
});
