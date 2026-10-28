import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_DEADLINE } from '@/domain/calendar';
import { calDate } from '@/domain/time';

import { myPointsPage, newPointPage, pointPage } from './index';

const resolvePrincipal = vi.hoisted(() => vi.fn<() => Promise<unknown>>(async () => null));
const runRegistered = vi.hoisted(() => vi.fn());
const directoryMode = vi.hoisted(() => ({ value: 'on' as 'on' | 'off' }));
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
    directoryMode: directoryMode.value,
  }),
}));

/** 23:30 UTC on the 26th is already the 27th in Prague. */
const NOW = new Date('2026-10-26T23:30:00.000Z');
const ID = '0b0c1d2e-3f40-4152-8364-758697a8b9ca';
const TYPE_ID = '5d0c1d2e-3f40-4152-8364-758697a8b9cb';

const calledWith = () =>
  runRegistered.mock.calls[0] as [unknown, { name: string }, { input: unknown }];

beforeEach(() => {
  resolvePrincipal.mockReset();
  resolvePrincipal.mockResolvedValue({
    kind: 'user',
    actor: { id: 'u1', role: 'submitter', status: 'active', isStudent: false },
  });
  runRegistered.mockReset();
  directoryMode.value = 'on';
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

describe('pointPage', () => {
  const SPEC = [
    { key: 'ucastnici', label: 'Účastníci', kind: 'people', required: true },
    { key: 'vysledky', label: 'Výsledky', kind: 'text', required: false },
  ];
  const RECENTS = [
    {
      salutation: 'pani',
      givenName: 'Jana',
      familyName: 'Nováková',
      lastUsed: '2026-10-20T10:00:00.000Z',
    },
  ];
  const LOADED = {
    id: ID,
    kind: 'report',
    version: 3,
    state: 'draft',
    editable: true,
    updatedAt: '2026-10-02T08:00:00.000Z',
    earliestMonday: null,
    submittedAt: null,
    isAuthor: true,
    content: {
      title: 'Exkurze do Terezína',
      eventDate: '2027-01-14',
      endDate: '2027-01-15',
      timeFrom: '07:00',
      timeTo: '14:30',
      campus: 'radlice',
      place: 'v učebně S206',
      opening: 'Úvodní věta.',
      openingEdited: false,
      body: { type: 'doc', content: [] },
      bullets: [],
      statements: [],
    },
    type: { id: TYPE_ID, name: 'Exkurze', titleGender: 'f', defaultBullets: SPEC },
    timeline: [],
  };
  const WINDOW = {
    submitMonday: '2026-11-02',
    issues: [
      {
        monday: '2026-11-02',
        deadlineAt: '2026-11-01T17:00:00.000Z',
        status: 'open',
        version: 2,
      },
    ],
  };
  /** Answers each use case the page asks for: the point, the author's recent people and the meeting calendar. */
  const serve = (
    loaded: unknown,
    recent: unknown = { ok: true, value: { people: RECENTS } },
    window: unknown = { ok: true, value: WINDOW },
  ) =>
    runRegistered.mockImplementation(async (_container: unknown, useCase: { name: string }) => {
      if (useCase.name === 'people.recent') return recent;
      return useCase.name === 'issues.window' ? window : loaded;
    });
  const askedFor = () => runRegistered.mock.calls.map((call) => (call[1] as { name: string }).name);
  beforeEach(() => {
    serve({ ok: true, value: LOADED });
  });

  it('is null for a visitor, without asking the use case', async () => {
    resolvePrincipal.mockResolvedValue(null);
    expect(await pointPage(ID)).toBeNull();
    expect(runRegistered).not.toHaveBeenCalled();
  });

  it('asks for the point by id', async () => {
    await pointPage(ID);
    expect(calledWith()[1].name).toBe('points.get');
    expect(calledWith()[2].input).toEqual({ id: ID });
  });

  it('writes the dates and times out, and passes the rest through', async () => {
    expect(await pointPage(ID)).toEqual({
      id: ID,
      kind: 'report',
      state: 'draft',
      title: 'Exkurze do Terezína',
      typeName: 'Exkurze',
      facts: {
        eventDate: '14. ledna 2027',
        endDate: '15. ledna 2027',
        timeFrom: '7.00',
        timeTo: '14.30',
        campus: 'radlice',
        place: 'v učebně S206',
      },
      version: 3,
      standing: {
        submitMonday: '2026-11-02',
        issues: WINDOW.issues,
        now: NOW.toISOString(),
        rule: DEFAULT_DEADLINE,
      },
      moves: ['withdraw'],
      read: { content: null, schoolYear: '2026/2027', timeline: [] },
      editor: {
        version: 3,
        content: LOADED.content,
        spec: SPEC,
        titleGender: 'f',
        today: calDate(2026, 10, 27),
        readinessSchoolYear: '2026/2027',
        recents: RECENTS,
        directory: 'on',
      },
    });
  });

  it('shows nothing the page does not use', async () => {
    const model = await pointPage(ID);
    expect(Object.keys(model ?? {}).sort()).toEqual(
      [
        'editor',
        'facts',
        'id',
        'kind',
        'moves',
        'read',
        'standing',
        'state',
        'title',
        'typeName',
        'version',
      ].sort(),
    );
  });

  it('leaves unset values null, and a point without a type has no type name', async () => {
    serve({
      ok: true,
      value: {
        ...LOADED,
        kind: 'pokyn',
        type: null,
        content: {
          ...LOADED.content,
          eventDate: null,
          endDate: null,
          timeFrom: null,
          timeTo: null,
          campus: null,
          place: null,
        },
      },
    });
    expect(await pointPage(ID)).toMatchObject({
      kind: 'pokyn',
      typeName: null,
      facts: {
        eventDate: null,
        endDate: null,
        timeFrom: null,
        timeTo: null,
        campus: null,
        place: null,
      },
    });
  });

  it.each(['', '   ', '\t\n'])('treats a blank place (%j) as unset', async (place) => {
    serve({
      ok: true,
      value: { ...LOADED, content: { ...LOADED.content, place } },
    });
    expect((await pointPage(ID))?.facts.place).toBeNull();
  });

  it('trims the place it shows', async () => {
    serve({
      ok: true,
      value: { ...LOADED, content: { ...LOADED.content, place: '  v učebně S206 ' } },
    });
    expect((await pointPage(ID))?.facts.place).toBe('v učebně S206');
  });

  describe('the editor part', () => {
    const loadedAs = (changes: object) => serve({ ok: true, value: { ...LOADED, ...changes } });

    it('carries the version and the content as the save takes it, for a draft its author may edit', async () => {
      loadedAs({ version: 7, state: 'returned' });
      expect((await pointPage(ID))?.editor).toMatchObject({
        version: 7,
        content: LOADED.content,
      });
    });

    it('carries the type’s bullets, so the editor knows which may go', async () => {
      expect((await pointPage(ID))?.editor?.spec).toEqual(SPEC);
    });

    it('has no bullets of a type for a point without one', async () => {
      loadedAs({ type: null });
      expect((await pointPage(ID))?.editor?.spec).toEqual([]);
    });

    it('carries the type’s title gender, which the opening sentence agrees with', async () => {
      expect((await pointPage(ID))?.editor?.titleGender).toBe('f');
    });

    it('has no title gender for a type without one, or for a point without a type', async () => {
      loadedAs({ type: { ...LOADED.type, titleGender: null } });
      expect((await pointPage(ID))?.editor?.titleGender).toBeNull();
      loadedAs({ type: null });
      expect((await pointPage(ID))?.editor?.titleGender).toBeNull();
    });

    it('carries today in Prague, which the picker counts the school year from', async () => {
      expect((await pointPage(ID))?.editor?.today).toEqual(calDate(2026, 10, 27));
    });

    it('carries the school year of today, by the rule the submit uses', async () => {
      expect((await pointPage(ID))?.editor?.readinessSchoolYear).toBe('2026/2027');
    });

    it('carries the author’s recent people, asked for as the viewer with no input', async () => {
      expect((await pointPage(ID))?.editor?.recents).toEqual(RECENTS);
      expect(askedFor()).toContain('people.recent');
      const [, , request] = runRegistered.mock.calls[askedFor().indexOf('people.recent')] as [
        unknown,
        unknown,
        { input: unknown; principal: unknown },
      ];
      expect(request.input).toEqual({});
      expect(request.principal).toEqual(await resolvePrincipal());
    });

    it('opens the editor with no memory when the memory is refused', async () => {
      serve({ ok: true, value: LOADED }, { ok: false, error: { code: 'forbidden' } });
      expect((await pointPage(ID))?.editor?.recents).toEqual([]);
    });

    it.each(['forbidden', 'not-found', 'invalid-input', 'unavailable', 'conflict'])(
      'still opens the editor, with no memory, when the memory fails with %s',
      async (code) => {
        serve({ ok: true, value: LOADED }, { ok: false, error: { code } });
        const page = await pointPage(ID);
        expect(page?.editor).toMatchObject({ version: 3, recents: [] });
      },
    );

    it.each(['on', 'off'] as const)(
      'carries the directory the server runs with: %s',
      async (mode) => {
        directoryMode.value = mode;
        expect((await pointPage(ID))?.editor?.directory).toBe(mode);
      },
    );

    it.each([
      ['a submitted point', { state: 'submitted', editable: false }],
      ['a point read by someone who is not its author', { isAuthor: false, editable: false }],
      ['an approved point', { state: 'approved', editable: false }],
    ])('is null for %s', async (_name, changes) => {
      loadedAs(changes);
      expect((await pointPage(ID))?.editor).toBeNull();
    });

    it.each([
      ['a submitted point', { state: 'submitted', editable: false }],
      ['a point read by someone who is not its author', { isAuthor: false, editable: false }],
    ])('does not ask for the memory for %s: no editor is shown', async (_name, changes) => {
      loadedAs(changes);
      await pointPage(ID);
      expect(askedFor()).toEqual(['points.get']);
    });
  });

  describe('the read view part', () => {
    const loadedAs = (changes: object) => serve({ ok: true, value: { ...LOADED, ...changes } });
    const EVENTS = [
      {
        event: 'return',
        fromState: 'submitted',
        toState: 'returned',
        note: 'Doplňte název.',
        editedFields: null,
        createdAt: '2026-10-05T09:00:00.000Z',
      },
      {
        event: 'submit',
        fromState: 'draft',
        toState: 'submitted',
        note: null,
        editedFields: null,
        createdAt: '2026-10-04T09:00:00.000Z',
      },
    ];

    it('carries the content as the use case sent it, for a point the viewer cannot edit', async () => {
      loadedAs({ state: 'submitted', editable: false, isAuthor: false });
      const page = await pointPage(ID);
      expect(page?.editor).toBeNull();
      expect(page?.read.content).toEqual(LOADED.content);
    });

    it('leaves the content to the editor where it shows, and sends it only once', async () => {
      loadedAs({});
      const page = await pointPage(ID);
      expect(page?.editor?.content).toEqual(LOADED.content);
      expect(page?.read.content).toBeNull();
    });

    it('keeps the content for a point whose editor does not show', async () => {
      loadedAs({ kind: 'pokyn' });
      expect((await pointPage(ID))?.read.content).toEqual(LOADED.content);
      loadedAs({ state: 'submitted', editable: false });
      expect((await pointPage(ID))?.read.content).toEqual(LOADED.content);
    });

    it('carries the timeline in the order sent, with only what the page writes', async () => {
      loadedAs({ timeline: EVENTS });
      expect((await pointPage(ID))?.read.timeline).toEqual([
        {
          event: 'return',
          note: 'Doplňte název.',
          editedFields: null,
          createdAt: EVENTS[0]!.createdAt,
        },
        { event: 'submit', note: null, editedFields: null, createdAt: EVENTS[1]!.createdAt },
      ]);
    });

    it('takes the school year from the Monday the point was first submitted for', async () => {
      loadedAs({ state: 'submitted', editable: false, earliestMonday: '2026-08-31' });
      expect((await pointPage(ID))?.read.schoolYear).toBe('2025/2026');
      loadedAs({ state: 'submitted', editable: false, earliestMonday: '2026-09-07' });
      expect((await pointPage(ID))?.read.schoolYear).toBe('2026/2027');
    });

    it('takes the school year of today in Prague for a point never submitted', async () => {
      loadedAs({ earliestMonday: null });
      expect((await pointPage(ID))?.read.schoolYear).toBe('2026/2027');
    });
  });

  describe('the standing line and the author’s moves', () => {
    const loadedAs = (changes: object) => serve({ ok: true, value: { ...LOADED, ...changes } });
    const windowCall = () =>
      runRegistered.mock.calls.find((c) => (c[1] as { name: string }).name === 'issues.window');

    it('reads the meeting calendar as the viewer, with no input, for the author of a draft', async () => {
      await pointPage(ID);
      const [, , request] = windowCall() as [
        unknown,
        unknown,
        { input: unknown; principal: unknown },
      ];
      expect(request.input).toEqual({});
      expect(request.principal).toEqual(await resolvePrincipal());
    });

    it('hands over the window, now and the deadline rule as they are', async () => {
      expect((await pointPage(ID))?.standing).toEqual({
        submitMonday: WINDOW.submitMonday,
        issues: WINDOW.issues,
        now: '2026-10-26T23:30:00.000Z',
        rule: DEFAULT_DEADLINE,
      });
    });

    it('carries the version the page showed, for a point in any state', async () => {
      loadedAs({ version: 8, state: 'submitted', editable: false });
      expect((await pointPage(ID))?.version).toBe(8);
    });

    it.each(['draft', 'returned'])('has a standing line for a %s of the author', async (state) => {
      loadedAs({ state });
      expect((await pointPage(ID))?.standing).not.toBeNull();
    });

    it.each([
      ['a submitted point', { state: 'submitted', editable: false }],
      ['an approved point', { state: 'approved', editable: false }],
      ['a draft read by someone else', { isAuthor: false, editable: false }],
    ])('has no standing line and does not read the calendar for %s', async (_name, changes) => {
      loadedAs(changes);
      expect((await pointPage(ID))?.standing).toBeNull();
      expect(windowCall()).toBeUndefined();
    });

    it.each(['forbidden', 'not-found'])(
      'shows the point without a standing line when the calendar is refused (%s)',
      async (code) => {
        serve({ ok: true, value: LOADED }, undefined, { ok: false, error: { code } });
        const page = await pointPage(ID);
        expect(page?.standing).toBeNull();
        expect(page?.editor?.version).toBe(3);
      },
    );

    it('fails loudly when the calendar fails otherwise', async () => {
      serve({ ok: true, value: LOADED }, undefined, { ok: false, error: { code: 'unavailable' } });
      await expect(pointPage(ID)).rejects.toThrow('issues.window: unavailable');
    });

    it.each([
      ['a draft', 'draft', ['withdraw']],
      ['a returned point', 'returned', ['withdraw']],
      ['a submitted point', 'submitted', ['retract', 'withdraw']],
      ['an approved point', 'approved', []],
      ['a rejected point', 'rejected', []],
      ['a withdrawn point', 'withdrawn', []],
      ['a published point', 'published', []],
    ])('offers the author of %s the moves the machine allows', async (_name, state, moves) => {
      loadedAs({ state, editable: state === 'draft' || state === 'returned' });
      expect((await pointPage(ID))?.moves).toEqual(moves);
    });

    it.each(['submitter', 'reviewer', 'headmaster'])(
      'offers a %s who did not write the submitted point no move',
      async (role) => {
        resolvePrincipal.mockResolvedValue({
          kind: 'user',
          actor: { id: 'u2', role, status: 'active', isStudent: false },
        });
        loadedAs({ state: 'submitted', isAuthor: false, editable: false });
        expect((await pointPage(ID))?.moves).toEqual([]);
      },
    );

    it('offers the headmaster who wrote the point the author’s moves', async () => {
      resolvePrincipal.mockResolvedValue({
        kind: 'user',
        actor: { id: 'u1', role: 'headmaster', status: 'active', isStudent: false },
      });
      loadedAs({ state: 'submitted', editable: false });
      expect((await pointPage(ID))?.moves).toEqual(['retract', 'withdraw']);
    });

    it('offers no move to an author whose account is no longer active: the policy decides', async () => {
      resolvePrincipal.mockResolvedValue({
        kind: 'user',
        actor: { id: 'u1', role: 'submitter', status: 'deactivated', isStudent: false },
      });
      loadedAs({ state: 'submitted', editable: false });
      expect((await pointPage(ID))?.moves).toEqual([]);
    });
  });

  it.each(['forbidden', 'not-found', 'invalid-input'])('is null on %s', async (code) => {
    serve({ ok: false, error: { code } });
    expect(await pointPage('nonsense')).toBeNull();
  });

  it('fails loudly on any other failure', async () => {
    serve({ ok: false, error: { code: 'unavailable' } });
    await expect(pointPage(ID)).rejects.toThrow('points.get: unavailable');
  });
});

describe('myPointsPage', () => {
  const CURSOR = `1792396800000.${ID}`;
  const summary = (over: object = {}) => ({
    id: ID,
    kind: 'report',
    typeId: TYPE_ID,
    state: 'draft',
    title: 'Exkurze',
    eventDate: '2026-11-20',
    earliestMonday: null,
    submittedAt: null,
    returnNote: null,
    version: 2,
    updatedAt: '2026-10-20T08:00:00.000Z',
    ...over,
  });
  const issue = (monday: string, status: string) => ({
    monday,
    deadlineAt: `${monday}T00:00:00.000Z`,
    status,
    version: 1,
  });
  /** Answers the list and the meeting calendar; the calendar's rows are the ones a test sets. */
  const serve = (
    rows: unknown[],
    next: string | null = null,
    window: unknown = { ok: true, value: { submitMonday: '2026-11-02', issues: [] } },
  ) =>
    runRegistered.mockImplementation(async (_container: unknown, useCase: { name: string }) =>
      useCase.name === 'issues.window' ? window : { ok: true, value: { points: rows, next } },
    );
  const askedFor = () => runRegistered.mock.calls.map((call) => (call[1] as { name: string }).name);
  const callOf = (name: string) =>
    runRegistered.mock.calls.find((call) => (call[1] as { name: string }).name === name) as
      [unknown, unknown, { input: unknown; principal: unknown }] | undefined;
  const rowsOf = async (given: unknown[], window?: unknown) => {
    serve(given, null, window);
    return (await myPointsPage({}))?.rows;
  };

  it('is null for a visitor, without asking a use case', async () => {
    resolvePrincipal.mockResolvedValue(null);
    expect(await myPointsPage({})).toBeNull();
    expect(runRegistered).not.toHaveBeenCalled();
  });

  it('asks for the first page as the viewer, with no cursor', async () => {
    serve([summary()]);
    await myPointsPage({});
    expect(callOf('points.listMine')?.[2].input).toEqual({});
    expect(callOf('points.listMine')?.[2].principal).toEqual(await resolvePrincipal());
  });

  it('asks for the page after the cursor in ?pred, the first of a repeated one', async () => {
    serve([summary()]);
    await myPointsPage({ pred: [CURSOR, 'other'] });
    expect(callOf('points.listMine')?.[2].input).toEqual({ before: CURSOR });
  });

  it('gives the rows the page uses, in the order sent, and the cursor of the next page', async () => {
    serve(
      [
        summary({ id: 'a', state: 'returned', title: '', returnNote: 'Doplňte název.' }),
        summary({ id: 'b', state: 'draft' }),
      ],
      CURSOR,
    );
    expect(await myPointsPage({})).toEqual({
      rows: [
        { id: 'a', state: 'returned', title: '', returnNote: 'Doplňte název.', placement: null },
        { id: 'b', state: 'draft', title: 'Exkurze', returnNote: null, placement: null },
      ],
      next: CURSOR,
      first: true,
    });
  });

  it('knows a page after a cursor is not the first', async () => {
    serve([summary()]);
    expect((await myPointsPage({}))?.first).toBe(true);
    expect((await myPointsPage({ pred: CURSOR }))?.first).toBe(false);
  });

  it('has no rows and no next page for an author with no points', async () => {
    serve([]);
    expect(await myPointsPage({})).toEqual({ rows: [], next: null, first: true });
  });

  describe('where an approved point goes', () => {
    const approved = (earliestMonday: string | null, state = 'approved') =>
      summary({ id: 'p', state, earliestMonday, submittedAt: '2026-10-20T08:00:00.000Z' });

    it('is its own Monday while that porada is open, with no row or an open one', async () => {
      expect((await rowsOf([approved('2026-11-09')]))?.[0]?.placement).toBe('2026-11-09');
      const open = {
        ok: true,
        value: { submitMonday: '2026-11-02', issues: [issue('2026-11-09', 'open')] },
      };
      expect((await rowsOf([approved('2026-11-09')], open))?.[0]?.placement).toBe('2026-11-09');
    });

    it('moves past a skipped or generated Monday', async () => {
      const window = {
        ok: true,
        value: {
          submitMonday: '2026-11-16',
          issues: [issue('2026-11-09', 'skipped'), issue('2026-11-16', 'generated')],
        },
      };
      expect((await rowsOf([approved('2026-11-09')], window))?.[0]?.placement).toBe('2026-11-23');
    });

    it('starts from the point’s own Monday, even one before the submit Monday', async () => {
      const window = { ok: true, value: { submitMonday: '2026-11-16', issues: [] } };
      expect((await rowsOf([approved('2026-11-09')], window))?.[0]?.placement).toBe('2026-11-09');
    });

    it('never names a porada that is over: an earliest Monday before the window moves to the next one', async () => {
      // Now is Tuesday 2026-10-27 in Prague; the window starts at 2026-10-26 and has no row for 2026-10-19.
      const window = { ok: true, value: { submitMonday: '2026-11-02', issues: [] } };
      expect((await rowsOf([approved('2026-10-19')], window))?.[0]?.placement).toBe('2026-11-02');
      const skipped = {
        ok: true,
        value: { submitMonday: '2026-11-02', issues: [issue('2026-11-02', 'skipped')] },
      };
      expect((await rowsOf([approved('2026-10-19')], skipped))?.[0]?.placement).toBe('2026-11-09');
    });

    it('is none for any other state, and the calendar is not read when no point is approved', async () => {
      serve([
        approved('2026-11-09', 'published'),
        summary({ state: 'submitted', earliestMonday: '2026-11-09' }),
      ]);
      expect((await myPointsPage({}))?.rows.map((r) => r.placement)).toEqual([null, null]);
      expect(askedFor()).toEqual(['points.listMine']);
    });

    it('is none for an approved point with no Monday on record', async () => {
      expect((await rowsOf([approved(null)]))?.[0]?.placement).toBeNull();
    });

    it('is none when no Monday of the window is open', async () => {
      const closed = Array.from({ length: 26 }, (_, week) => {
        const monday = new Date(Date.UTC(2026, 10, 9 + 7 * week)).toISOString().slice(0, 10);
        return issue(monday, 'skipped');
      });
      const window = { ok: true, value: { submitMonday: '2026-11-09', issues: closed } };
      expect((await rowsOf([approved('2026-11-09')], window))?.[0]?.placement).toBeNull();
    });

    it('reads the calendar once, as the viewer, for all the approved points', async () => {
      serve([approved('2026-11-09'), approved('2026-11-16')]);
      await myPointsPage({});
      expect(askedFor().filter((name) => name === 'issues.window')).toHaveLength(1);
      expect(callOf('issues.window')?.[2].input).toEqual({});
    });

    it.each(['forbidden', 'not-found'])(
      'lists the points without a date when the calendar is refused (%s)',
      async (code) => {
        const rows = await rowsOf([approved('2026-11-09')], { ok: false, error: { code } });
        expect(rows?.[0]).toMatchObject({ state: 'approved', placement: null });
      },
    );

    it('fails loudly when the calendar fails otherwise', async () => {
      serve([approved('2026-11-09')], null, { ok: false, error: { code: 'unavailable' } });
      await expect(myPointsPage({})).rejects.toThrow('issues.window: unavailable');
    });
  });

  it.each(['forbidden', 'not-found', 'invalid-input'])(
    'is null on %s (a bad cursor included)',
    async (code) => {
      runRegistered.mockResolvedValue({ ok: false, error: { code } });
      expect(await myPointsPage({ pred: 'nonsense' })).toBeNull();
    },
  );

  it('fails loudly on any other failure', async () => {
    runRegistered.mockResolvedValue({ ok: false, error: { code: 'unavailable' } });
    await expect(myPointsPage({})).rejects.toThrow('points.listMine: unavailable');
  });
});
