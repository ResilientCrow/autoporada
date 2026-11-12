import { beforeEach, describe, expect, it, vi } from 'vitest';

import { futureListPage, futurePage, newFuturePage } from './index';

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
    directoryMode: 'off',
    app: { clock: { now: () => new Date('2026-11-04T10:00:00Z') } },
  }),
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
  ...over,
});
const content = (over: object = {}) => ({ ...view(), ...over });
const loaded = (over: object = {}) => ({
  id: ID,
  kind: 'akce',
  state: 'draft',
  version: 3,
  isAuthor: true,
  editable: true,
  content: content(),
  view: view(),
  timeline: [],
  ...over,
});
const WINDOW = {
  submitMonday: '2026-11-09',
  stripFrom: '2026-11-09',
  issues: [{ monday: '2026-11-16', deadlineAt: '2026-11-15T17:00:00.000Z', status: 'generated' }],
};

/** Answers the use cases the page asks for. */
const serve = (answers: { get?: unknown; list?: unknown; window?: unknown; recents?: unknown }) =>
  runRegistered.mockImplementation(async (_container: unknown, useCase: { name: string }) => {
    if (useCase.name === 'future.get') return answers.get;
    if (useCase.name === 'future.list') return answers.list;
    if (useCase.name === 'people.recent') {
      return answers.recents ?? { ok: true, value: { people: [] } };
    }
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
    expect(await futureListPage({})).toEqual({
      rows: [ROW],
      next: 'abc',
      first: true,
      canCreate: true,
    });
    expect(input('future.list')).toEqual({});
  });

  it('continues from ?pred, and a page after a cursor is not the first', async () => {
    serve({ list: { ok: true, value: { items: [], next: null } } });
    expect(await futureListPage({ pred: 'abc' })).toEqual({
      rows: [],
      next: null,
      first: false,
      canCreate: true,
    });
    expect(input('future.list')).toEqual({ before: 'abc' });
  });

  it('does not offer a new item to a viewer who may not start one', async () => {
    resolvePrincipal.mockResolvedValue({
      kind: 'user',
      actor: { id: 'u2', role: 'pending', status: 'active', isStudent: false },
    });
    serve({ list: { ok: true, value: { items: [], next: null } } });
    expect((await futureListPage({}))?.canCreate).toBe(false);
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
      canRetract: false,
      review: null,
      returnNote: null,
      returnParts: [],
      editor: {
        version: 3,
        content: content(),
      },
      view: view(),
      window: WINDOW,
    });
    expect(asked().sort()).toEqual(['future.get', 'issues.window', 'people.recent']);
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
      serve({ get: { ok: true, value: loaded({ state, editable: false }) } });
      expect((await futurePage(ID))?.window).toBeNull();
      expect(asked()).toEqual(['future.get']);
    },
  );

  it('reads no calendar for a reader who is not the author', async () => {
    serve({
      get: {
        ok: true,
        value: loaded({ isAuthor: false, editable: false, content: null, state: 'approved' }),
      },
    });
    expect((await futurePage(ID))?.window).toBeNull();
    expect(asked()).not.toContain('issues.window');
  });

  it('reads the calendar for a draft with no start date yet, so the strip shows as the date is typed', async () => {
    serve({
      get: {
        ok: true,
        value: loaded({ content: content({ startDate: null }), view: view({ startDate: null }) }),
      },
    });
    expect((await futurePage(ID))?.window).toEqual(WINDOW);
  });

  it('leaves the strip out when the calendar is refused, which is only a convenience', async () => {
    serve({
      get: { ok: true, value: loaded() },
      window: { ok: false, error: { code: 'forbidden' } },
    });
    expect((await futurePage(ID))?.window).toBeNull();
  });
});

describe('futurePage: the editor', () => {
  it.each(['draft', 'returned', 'approved'] as const)(
    'is there for the author of a %s item',
    async (state) => {
      serve({
        get: { ok: true, value: loaded({ state }) },
      });
      const model = await futurePage(ID);
      expect(model?.editor?.version).toBe(3);
    },
  );

  it.each([
    ['not the author', { isAuthor: false, editable: false, content: null, state: 'approved' }],
    ['submitted', { state: 'submitted', editable: false }],
    ['rejected', { state: 'rejected', editable: false }],
  ])('is null when the item is %s', async (_name, over) => {
    serve({ get: { ok: true, value: loaded(over) } });
    expect((await futurePage(ID))?.editor).toBeNull();
  });
});

describe('futurePage: the return note', () => {
  const event = (name: string, note: string | null, parts: string[] | null = null) => ({
    event: name,
    fromState: 'submitted',
    toState: 'returned',
    note,
    parts,
    editedFields: null,
    createdAt: '2026-11-05T09:00:00.000Z',
  });

  it('carries the latest return note of a returned item, for the editor to show', async () => {
    // Newest first, as `future.get` lists the timeline.
    const timeline = [
      event('submit', null),
      event('return', 'Doplňte prosím vyjádření.'),
      event('return', 'Starší poznámka.'),
    ];
    serve({ get: { ok: true, value: loaded({ state: 'returned', timeline }) } });
    expect((await futurePage(ID))?.returnNote).toBe('Doplňte prosím vyjádření.');
  });

  it.each(['draft', 'submitted', 'approved'] as const)(
    'leaves an older return out once the item is %s again',
    async (state) => {
      serve({
        get: { ok: true, value: loaded({ state, timeline: [event('return', 'Starší.')] }) },
      });
      expect((await futurePage(ID))?.returnNote).toBeNull();
    },
  );

  it('is null where no return event is left to read', async () => {
    serve({ get: { ok: true, value: loaded({ state: 'returned' }) } });
    expect((await futurePage(ID))?.returnNote).toBeNull();
    expect((await futurePage(ID))?.returnParts).toEqual([]);
  });

  it('carries the parts the latest return named, a note or not (ADR 0058)', async () => {
    const timeline = [event('return', null, ['when', 'place']), event('return', 'Starší.')];
    serve({ get: { ok: true, value: loaded({ state: 'returned', timeline }) } });
    expect(await futurePage(ID)).toMatchObject({
      returnNote: null,
      returnParts: ['when', 'place'],
    });
  });

  it('leaves the parts out once the item is submitted again', async () => {
    const timeline = [event('return', null, ['place'])];
    serve({ get: { ok: true, value: loaded({ state: 'submitted', timeline }) } });
    expect((await futurePage(ID))?.returnParts).toEqual([]);
  });
});

describe('futurePage: the retract', () => {
  it('is offered to the author of a submitted item', async () => {
    serve({ get: { ok: true, value: loaded({ state: 'submitted', editable: false }) } });
    expect((await futurePage(ID))?.canRetract).toBe(true);
  });

  it.each([
    ['draft', true],
    ['approved', true],
    ['submitted', false],
  ] as const)('is not offered for a %s item (author: %s)', async (state, isAuthor) => {
    serve({ get: { ok: true, value: loaded({ state, isAuthor, editable: false }) } });
    expect((await futurePage(ID))?.canRetract).toBe(state === 'submitted' && isAuthor);
  });
});

describe('futurePage: the review bar', () => {
  const as = (role: string) =>
    resolvePrincipal.mockResolvedValue({
      kind: 'user',
      actor: { id: 'u1', role, status: 'active', isStudent: false },
    });
  const bar = async (state: string, isAuthor: boolean, kind = 'akce') => {
    serve({ get: { ok: true, value: loaded({ state, isAuthor, kind, editable: false }) } });
    return (await futurePage(ID))?.review;
  };

  it('offers a reviewer all three decisions on a handed-in item that is not theirs', async () => {
    as('reviewer');
    expect(await bar('submitted', false)).toEqual({
      decisions: ['approve', 'return', 'reject'],
      othersApprove: false,
      canCancel: false,
    });
  });

  it('takes „Schválit“ from a reviewer’s own item and says someone else approves it', async () => {
    as('reviewer');
    expect(await bar('submitted', true)).toEqual({
      decisions: ['return', 'reject'],
      othersApprove: true,
      canCancel: false,
    });
  });

  it('lets the headmaster approve their own item', async () => {
    as('headmaster');
    expect((await bar('submitted', true))?.decisions).toEqual(['approve', 'return', 'reject']);
  });

  it('offers a reviewer the return, the reject and the cancel of an approved akce', async () => {
    as('reviewer');
    expect(await bar('approved', false)).toEqual({
      decisions: ['return', 'reject'],
      othersApprove: false,
      canCancel: true,
    });
  });

  it('offers the author of an approved akce the cancel and no decision', async () => {
    as('submitter');
    expect(await bar('approved', true)).toEqual({
      decisions: [],
      othersApprove: false,
      canCancel: true,
    });
  });

  it('offers nothing to a reader who is neither the author nor a reviewer', async () => {
    as('submitter');
    expect(await bar('approved', false)).toBeNull();
    expect(await bar('submitted', false)).toBeNull();
  });

  it('offers the author of a draft nothing', async () => {
    as('submitter');
    expect(await bar('draft', true)).toBeNull();
  });

  // The bar stays for a reviewer, so what they just decided can still be said into it.
  it.each(['draft', 'returned', 'rejected', 'withdrawn', 'cancelled'] as const)(
    'keeps an empty bar for a reviewer on a %s item',
    async (state) => {
      as('reviewer');
      expect(await bar(state, false)).toEqual({
        decisions: [],
        othersApprove: false,
        canCancel: false,
      });
    },
  );
});

describe('newFuturePage', () => {
  it('is null for a visitor', async () => {
    resolvePrincipal.mockResolvedValue(null);
    expect(await newFuturePage()).toBeNull();
  });

  it('offers akce and jednání to a submitter', async () => {
    expect(await newFuturePage()).toEqual({ kinds: ['akce', 'jednani'] });
  });

  it('is null for a viewer who may not start one', async () => {
    resolvePrincipal.mockResolvedValue({
      kind: 'user',
      actor: { id: 'u2', role: 'pending', status: 'active', isStudent: false },
    });
    expect(await newFuturePage()).toBeNull();
  });
});
