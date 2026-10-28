import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_DEADLINE } from '@/domain/calendar';
import { calDate } from '@/domain/time';

import { newPointPage, pointPage } from './index';

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
  resolvePrincipal.mockResolvedValue({ kind: 'user', actor: { id: 'u1', role: 'submitter' } });
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
        resolvePrincipal.mockResolvedValue({ kind: 'user', actor: { id: 'u2', role } });
        loadedAs({ state: 'submitted', isAuthor: false, editable: false });
        expect((await pointPage(ID))?.moves).toEqual([]);
      },
    );

    it('offers the headmaster who wrote the point the author’s moves', async () => {
      resolvePrincipal.mockResolvedValue({ kind: 'user', actor: { id: 'u1', role: 'headmaster' } });
      loadedAs({ state: 'submitted', editable: false });
      expect((await pointPage(ID))?.moves).toEqual(['retract', 'withdraw']);
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
