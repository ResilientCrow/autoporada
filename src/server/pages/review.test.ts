import { beforeEach, describe, expect, it, vi } from 'vitest';

import { queuePage, reviewPointPage } from './index';

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

/** 23:30 UTC on the 26th is already the 27th in Prague. */
const NOW = new Date('2026-10-26T23:30:00.000Z');
const ID = '0b0c1d2e-3f40-4152-8364-758697a8b9ca';

const as = (role: string) =>
  resolvePrincipal.mockResolvedValue({
    kind: 'user',
    actor: { id: 'u1', role, status: 'active', isStudent: false },
  });
const asked = () =>
  runRegistered.mock.calls.map((call) => [
    (call[1] as { name: string }).name,
    (call[2] as { input: unknown }).input,
  ]);

beforeEach(() => {
  resolvePrincipal.mockReset();
  resolvePrincipal.mockResolvedValue(null);
  runRegistered.mockReset();
});

describe('queuePage', () => {
  const QUEUE = {
    mondays: [
      {
        monday: '2026-11-02',
        kinds: [{ kind: 'pokyn', points: [{ id: ID, title: 'Nákup', returnedBefore: true }] }],
      },
    ],
    approved: [],
    more: false,
  };

  it('is null for a visitor, without asking the use case', async () => {
    expect(await queuePage()).toBeNull();
    expect(runRegistered).not.toHaveBeenCalled();
  });

  it('gives the queue as the use case sent it, asked for as the viewer with no input', async () => {
    as('reviewer');
    runRegistered.mockResolvedValue({ ok: true, value: QUEUE });
    expect(await queuePage()).toEqual(QUEUE);
    expect(asked()).toEqual([['points.queue', {}]]);
  });

  it('is null when the use case refuses the viewer', async () => {
    as('submitter');
    runRegistered.mockResolvedValue({ ok: false, error: { code: 'forbidden' } });
    expect(await queuePage()).toBeNull();
  });

  it('fails loudly on any other failure', async () => {
    as('reviewer');
    runRegistered.mockResolvedValue({ ok: false, error: { code: 'unavailable' } });
    await expect(queuePage()).rejects.toThrow('points.queue: unavailable');
  });
});

describe('reviewPointPage', () => {
  const LOADED = {
    id: ID,
    kind: 'report',
    version: 4,
    state: 'submitted',
    editable: false,
    updatedAt: '2026-10-20T08:00:00.000Z',
    earliestMonday: '2027-09-06',
    submittedAt: '2026-10-20T08:00:00.000Z',
    isAuthor: false,
    content: {
      title: 'Exkurze do Terezína',
      eventDate: '2027-01-14',
      endDate: null,
      timeFrom: '07:00',
      timeTo: null,
      campus: 'radlice',
      place: ' v učebně S206 ',
      opening: 'Úvodní věta.',
      openingEdited: false,
      body: { type: 'doc', content: [] },
      bullets: [],
      statements: [],
    },
    type: { id: ID, name: 'Exkurze', titleGender: 'f', defaultBullets: [] },
    timeline: [
      {
        event: 'submit',
        fromState: 'draft',
        toState: 'submitted',
        note: null,
        editedFields: null,
        createdAt: '2026-10-20T08:00:00.000Z',
      },
    ],
  };
  const serve = (over: Record<string, unknown> = {}) =>
    runRegistered.mockResolvedValue({ ok: true, value: { ...LOADED, ...over } });

  it('is null for a visitor, without asking the use case', async () => {
    expect(await reviewPointPage(ID)).toBeNull();
    expect(runRegistered).not.toHaveBeenCalled();
  });

  it('is null for whoever may not review, without asking the use case', async () => {
    as('submitter');
    expect(await reviewPointPage(ID)).toBeNull();
    expect(runRegistered).not.toHaveBeenCalled();
  });

  it('asks for the point by id, as the viewer', async () => {
    as('reviewer');
    serve();
    await reviewPointPage(ID);
    expect(asked()).toEqual([['points.get', { id: ID }]]);
  });

  it('carries the header, the facts written out and the read view with its content', async () => {
    as('reviewer');
    serve();
    const model = await reviewPointPage(ID);
    expect(model).toMatchObject({
      id: ID,
      kind: 'report',
      state: 'submitted',
      version: 4,
      title: 'Exkurze do Terezína',
      typeName: 'Exkurze',
      facts: {
        eventDate: '14. ledna 2027',
        endDate: null,
        timeFrom: '7.00',
        timeTo: null,
        campus: 'radlice',
        place: 'v učebně S206',
      },
      read: {
        content: LOADED.content,
        schoolYear: '2027/2028',
        timeline: [
          { event: 'submit', note: null, editedFields: null, createdAt: LOADED.updatedAt },
        ],
      },
    });
    // No editor, standing or author's moves: the reviewer's page decides, it does not write.
    expect(Object.keys(model ?? {}).sort()).toEqual(
      ['bar', 'facts', 'id', 'kind', 'read', 'state', 'title', 'typeName', 'version'].sort(),
    );
  });

  describe('what the decision bar may offer', () => {
    const barOf = async (role: string, over: Record<string, unknown> = {}) => {
      as(role);
      serve(over);
      return (await reviewPointPage(ID))?.bar;
    };

    it('offers a reviewer every decision and the edit on a colleague’s submitted point', async () => {
      expect(await barOf('reviewer')).toEqual({
        decisions: ['approve', 'return', 'reject'],
        canEdit: true,
        othersApprove: false,
      });
    });

    it('never lets a reviewer approve or edit their own point', async () => {
      expect(await barOf('reviewer', { isAuthor: true })).toEqual({
        decisions: ['return', 'reject'],
        canEdit: false,
        othersApprove: true,
      });
    });

    it('lets the headmaster approve their own point, but not edit it here', async () => {
      expect(await barOf('headmaster', { isAuthor: true })).toEqual({
        decisions: ['approve', 'return', 'reject'],
        canEdit: false,
        othersApprove: false,
      });
    });

    it('offers return and reject on an approved point, and the edit to an approver', async () => {
      expect(await barOf('reviewer', { state: 'approved' })).toEqual({
        decisions: ['return', 'reject'],
        canEdit: true,
        othersApprove: false,
      });
    });

    it('says nothing of other approvers on a reviewer’s own approved point', async () => {
      expect(await barOf('reviewer', { state: 'approved', isAuthor: true })).toMatchObject({
        othersApprove: false,
      });
    });

    it.each(['returned', 'rejected', 'withdrawn', 'published'])(
      'offers nothing on a %s point',
      async (state) => {
        expect(await barOf('headmaster', { state })).toEqual({
          decisions: [],
          canEdit: false,
          othersApprove: false,
        });
      },
    );
  });

  it.each(['forbidden', 'not-found', 'invalid-input'])('is null on %s', async (code) => {
    as('reviewer');
    runRegistered.mockResolvedValue({ ok: false, error: { code } });
    expect(await reviewPointPage(ID)).toBeNull();
  });

  it('fails loudly on any other failure', async () => {
    as('reviewer');
    runRegistered.mockResolvedValue({ ok: false, error: { code: 'unavailable' } });
    await expect(reviewPointPage(ID)).rejects.toThrow('points.get: unavailable');
  });
});
