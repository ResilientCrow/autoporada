import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { UserPrincipal } from '@/application/ports';
import { POINT_TYPES } from '@/domain/report';

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

const item = (id: string, closesAt: string) => ({
  id,
  title: `Akce ${id}`,
  startDate: '2026-11-10',
  endDate: '2026-11-11',
  timeFrom: null,
  timeTo: null,
  monday: '2026-11-16',
  meetingDate: '2026-11-16',
  closesAt,
  report: null,
});

/** Answers the use case the loader asks for. */
const serve = (items: unknown[], answer: unknown = { ok: true, value: { items } }) =>
  runRegistered.mockImplementation(async () => answer);

describe('reportDueOf', () => {
  beforeEach(() => {
    runRegistered.mockReset();
  });

  it('gives the owed akce as read, each saying whether its close has passed, with the types', async () => {
    serve([item('a', '2026-11-12T10:00:00.000Z'), item('b', '2026-11-14T19:00:00.000Z')]);
    expect(await reportDueOf(viewer('submitter'))).toEqual({
      items: [
        { ...item('a', '2026-11-12T10:00:00.000Z'), overdue: true },
        { ...item('b', '2026-11-14T19:00:00.000Z'), overdue: false },
      ],
      types: POINT_TYPES.map(({ id, name }) => ({ id, name })),
    });
  });

  it('asks for the owed reports, as the viewer', async () => {
    serve([]);
    const who = viewer('submitter');
    await reportDueOf(who);
    const calls = runRegistered.mock.calls as [
      unknown,
      { name: string },
      { input: unknown; principal: unknown },
    ][];
    expect(calls.map(([, useCase]) => useCase.name)).toEqual(['future.owedReports']);
    expect(calls.map(([, , call]) => call.input)).toEqual([{}]);
    expect(calls.every(([, , call]) => call.principal === who)).toBe(true);
  });

  it('is null for whoever may not start items, without asking', async () => {
    expect(await reportDueOf(viewer('pending'))).toBeNull();
    expect(runRegistered).not.toHaveBeenCalled();
  });

  it.each(['forbidden', 'not-found', 'invalid-input'])(
    'is null when a read is refused (%s)',
    async (code) => {
      serve([item('a', '2026-11-12T10:00:00.000Z')], { ok: false, error: { code } });
      expect(await reportDueOf(viewer('submitter'))).toBeNull();
    },
  );
});
