import { beforeEach, describe, expect, it, vi } from 'vitest';

import { newPointPage, pointPage } from './index';

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
const TYPE_ID = '5d0c1d2e-3f40-4152-8364-758697a8b9cb';

const calledWith = () =>
  runRegistered.mock.calls[0] as [unknown, { name: string }, { input: unknown }];

beforeEach(() => {
  resolvePrincipal.mockReset();
  resolvePrincipal.mockResolvedValue({ kind: 'user', actor: { id: 'u1', role: 'submitter' } });
  runRegistered.mockReset();
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
    type: { id: TYPE_ID, name: 'Exkurze', titleGender: 'f', defaultBullets: [] },
    timeline: [],
  };
  beforeEach(() => runRegistered.mockResolvedValue({ ok: true, value: LOADED }));

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
      editor: { version: 3, content: LOADED.content },
    });
  });

  it('shows nothing the page does not use', async () => {
    const model = await pointPage(ID);
    expect(Object.keys(model ?? {}).sort()).toEqual(
      ['editor', 'facts', 'id', 'kind', 'state', 'title', 'typeName'].sort(),
    );
  });

  it('leaves unset values null, and a point without a type has no type name', async () => {
    runRegistered.mockResolvedValue({
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
    runRegistered.mockResolvedValue({
      ok: true,
      value: { ...LOADED, content: { ...LOADED.content, place } },
    });
    expect((await pointPage(ID))?.facts.place).toBeNull();
  });

  it('trims the place it shows', async () => {
    runRegistered.mockResolvedValue({
      ok: true,
      value: { ...LOADED, content: { ...LOADED.content, place: '  v učebně S206 ' } },
    });
    expect((await pointPage(ID))?.facts.place).toBe('v učebně S206');
  });

  describe('the editor part', () => {
    const loadedAs = (changes: object) =>
      runRegistered.mockResolvedValue({ ok: true, value: { ...LOADED, ...changes } });

    it('carries the version and the content as the save takes it, for a draft its author may edit', async () => {
      loadedAs({ version: 7, state: 'returned' });
      expect((await pointPage(ID))?.editor).toEqual({ version: 7, content: LOADED.content });
    });

    it.each([
      ['a submitted point', { state: 'submitted', editable: false }],
      ['a point read by someone who is not its author', { isAuthor: false, editable: false }],
      ['an approved point', { state: 'approved', editable: false }],
    ])('is null for %s', async (_name, changes) => {
      loadedAs(changes);
      expect((await pointPage(ID))?.editor).toBeNull();
    });
  });

  it.each(['forbidden', 'not-found', 'invalid-input'])('is null on %s', async (code) => {
    runRegistered.mockResolvedValue({ ok: false, error: { code } });
    expect(await pointPage('nonsense')).toBeNull();
  });

  it('fails loudly on any other failure', async () => {
    runRegistered.mockResolvedValue({ ok: false, error: { code: 'unavailable' } });
    await expect(pointPage(ID)).rejects.toThrow('points.get: unavailable');
  });
});
