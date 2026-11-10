import { readFileSync } from 'node:fs';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { outlineItemPage, outlinePage, newOutlineItemPage } from './outline';
import { issueTextsPage } from './issue-texts';
import { missingReportsPage } from './missing-reports';
import { archivePage, poradaIndexPage, poradaPage, previewPage } from './porada';

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
    app: { clock: { now: () => new Date('2026-11-03T10:00:00Z') } },
  }),
}));

const WHO = {
  headmaster: { role: 'headmaster', isStudent: false },
  staff: { role: 'reviewer', isStudent: false },
  student: { role: 'reviewer', isStudent: true },
  submitter: { role: 'submitter', isStudent: false },
};
const as = (who: keyof typeof WHO) =>
  resolvePrincipal.mockResolvedValue({
    kind: 'user',
    actor: { id: 'u1', status: 'active', ...WHO[who] },
  });

const WINDOW = {
  submitMonday: '2026-11-09',
  stripFrom: '2026-11-09',
  issues: [
    {
      monday: '2026-11-23',
      meetingDate: '2026-11-24',
      deadlineAt: '2026-11-22T19:00:00.000Z',
      status: 'open',
      version: 2,
    },
  ],
  rule: { dayOffset: -2, time: '20:00' },
  plannedThrough: '2026-11-02',
};

/** What `outline.read` says of a Monday: its origin kind. */
const outline = (origin: 'stored' | 'seed' | 'derived') => ({
  origin: { kind: origin, from: null },
});

const SLOT = {
  monday: '2026-11-09',
  meetingDate: '2026-11-11',
  deadlineAt: '2026-11-07T19:00:00.000Z',
  status: 'open',
  version: 3,
  next: '2026-11-16',
  counts: { waiting: 1, returned: 2, approved: 3, later: 0, missing: 0 },
  document: null,
};

/** Use cases answered by name, as the pipeline does. */
function answer(values: Record<string, unknown>) {
  runRegistered.mockImplementation(
    async (_c, useCase: { name: string }, args?: { input: unknown }) => {
      if (!(useCase.name in values)) throw new Error(`unexpected ${useCase.name}`);
      const given = values[useCase.name];
      const value =
        typeof given === 'function' ? (given as (input: unknown) => unknown)(args?.input) : given;
      return typeof value === 'object' && value !== null && 'error' in value
        ? { ok: false, error: (value as { error: unknown }).error }
        : { ok: true, value };
    },
  );
}

beforeEach(() => {
  resolvePrincipal.mockReset();
  resolvePrincipal.mockResolvedValue(null);
  runRegistered.mockReset();
});

describe('poradaIndexPage', () => {
  it('is null for a visitor, a student reviewer and a submitter, without asking a use case', async () => {
    expect(await poradaIndexPage()).toBeNull();
    for (const who of ['student', 'submitter'] as const) {
      as(who);
      expect(await poradaIndexPage()).toBeNull();
    }
    expect(runRegistered).not.toHaveBeenCalled();
  });

  it('names the working Monday, and marks a staff reviewer', async () => {
    answer({ 'issues.workspace': { working: '2026-11-09', slot: null } });
    as('headmaster');
    expect(await poradaIndexPage()).toEqual({ working: '2026-11-09', reviewer: false });
    as('staff');
    expect(await poradaIndexPage()).toEqual({ working: '2026-11-09', reviewer: true });
  });

  it('has no working Monday when the calendar has none (the empty state)', async () => {
    answer({ 'issues.workspace': { working: null, slot: null } });
    as('headmaster');
    expect(await poradaIndexPage()).toEqual({ working: null, reviewer: false });
  });
});

describe('poradaPage', () => {
  it('is null for a student reviewer and a submitter', async () => {
    for (const who of ['student', 'submitter'] as const) {
      as(who);
      expect(await poradaPage('2026-11-09')).toBeNull();
    }
    expect(runRegistered).not.toHaveBeenCalled();
  });

  it('is null for a Monday outside the calendar', async () => {
    as('headmaster');
    answer({ 'issues.workspace': { working: null, slot: null } });
    expect(await poradaPage('2030-01-07')).toBeNull();
  });

  it('writes the dates out for the headmaster, with the calendar the move and drop dialogs plan on', async () => {
    as('headmaster');
    answer({
      'issues.workspace': { working: '2026-11-09', slot: SLOT },
      'issues.window': WINDOW,
      'outline.read': outline('seed'),
    });
    expect(await poradaPage('2026-11-09')).toEqual({
      kind: 'workspace',
      model: {
        monday: '2026-11-09',
        meeting: 'středa 11. listopadu 2026',
        meetingLabel: '11. 11. 2026',
        meetingDate: '2026-11-11',
        deadline: { weekday: 'sobota', date: '7.\u00a011.', time: '20:00' },
        deadlinePassed: false,
        status: 'open',
        version: 3,
        calendar: {
          issues: WINDOW.issues,
          now: '2026-11-03T10:00:00.000Z',
          rule: { dayOffset: -2, time: { hour: 20, minute: 0 } },
          plannedThrough: '2026-11-02',
        },
        dropProgram: null,
        counts: SLOT.counts,
        generated: null,
      },
    });
  });

  describe('what dropping does to the prepared program', () => {
    const program = (own: 'stored' | 'seed', heir: 'stored' | 'seed', window = WINDOW) => {
      as('headmaster');
      answer({
        'issues.workspace': { working: '2026-11-09', slot: SLOT },
        'issues.window': window,
        'outline.read': (input: { monday: string }) =>
          outline(input.monday === '2026-11-09' ? own : heir),
      });
      return poradaPage('2026-11-09');
    };

    it('is null when the porada has no program of its own stored', async () => {
      expect(await program('seed', 'seed')).toMatchObject({ model: { dropProgram: null } });
    });

    it('goes along when the porada has one and its heir has none', async () => {
      expect(await program('stored', 'seed')).toMatchObject({ model: { dropProgram: 'along' } });
    });

    it('is lost when the heir has a program of its own', async () => {
      expect(await program('stored', 'stored')).toMatchObject({ model: { dropProgram: 'lost' } });
    });

    it('is lost when the heir is already generated', async () => {
      const generated = {
        ...WINDOW,
        issues: [
          {
            monday: '2026-11-16',
            meetingDate: '2026-11-16',
            deadlineAt: '2026-11-14T19:00:00.000Z',
            status: 'generated',
            version: 5,
          },
        ],
      };
      expect(await program('stored', 'seed', generated)).toMatchObject({
        model: { dropProgram: 'lost' },
      });
    });

    it('is null where the outline is refused', async () => {
      as('headmaster');
      answer({
        'issues.workspace': { working: '2026-11-09', slot: SLOT },
        'issues.window': WINDOW,
        'outline.read': { error: { code: 'not-found' } },
      });
      expect(await poradaPage('2026-11-09')).toMatchObject({ model: { dropProgram: null } });
    });
  });

  it('writes when a generated porada was generated, in Prague time', async () => {
    as('headmaster');
    const document = { generatedAt: '2026-11-09T13:05:00.000Z', pdfStatus: 'ready' };
    answer({
      'issues.workspace': { working: null, slot: { ...SLOT, status: 'generated', document } },
    });
    expect(await poradaPage('2026-11-09')).toMatchObject({
      model: {
        generated: { monday: '2026-11-09', date: '9. 11. 2026', time: '14:05', pdf: 'ready' },
      },
    });
  });

  it('carries why a PDF failed, or none for a failure from before the reason', async () => {
    as('headmaster');
    for (const pdfFailure of ['too-large', null]) {
      const document = {
        generatedAt: '2026-11-09T13:05:00.000Z',
        pdfStatus: 'failed',
        pdfFailure,
      };
      answer({
        'issues.workspace': { working: null, slot: { ...SLOT, status: 'generated', document } },
      });
      expect(await poradaPage('2026-11-09')).toMatchObject({
        model: { generated: { pdf: 'failed', pdfFailure } },
      });
    }
  });

  it('knows when the deadline has passed', async () => {
    as('headmaster');
    answer({
      'issues.workspace': {
        working: '2026-11-02',
        slot: {
          ...SLOT,
          monday: '2026-11-02',
          meetingDate: '2026-11-02',
          deadlineAt: '2026-10-31T19:00:00.000Z',
        },
      },
      'issues.window': WINDOW,
      'outline.read': outline('seed'),
    });
    expect(await poradaPage('2026-11-02')).toMatchObject({
      kind: 'workspace',
      model: { meetingDate: '2026-11-02', deadlinePassed: true },
    });
  });

  it('reads no calendar for a porada that is not open, and none the use case refuses', async () => {
    as('headmaster');
    answer({ 'issues.workspace': { working: null, slot: { ...SLOT, status: 'generated' } } });
    expect(await poradaPage('2026-11-09')).toMatchObject({
      model: { calendar: null, dropProgram: null },
    });
    answer({
      'issues.workspace': { working: null, slot: SLOT },
      'issues.window': { error: { code: 'forbidden' } },
    });
    expect(await poradaPage('2026-11-09')).toMatchObject({
      model: { calendar: null, dropProgram: null },
    });
  });

  it('sends a staff reviewer to the preview', async () => {
    as('staff');
    answer({ 'issues.workspace': { working: '2026-11-09', slot: SLOT } });
    expect(await poradaPage('2026-11-09')).toEqual({ kind: 'preview', monday: '2026-11-09' });
  });
});

describe('previewPage', () => {
  const snapshot = readFileSync(
    new URL('../../../test/fixtures/snapshots/template-replica.json', import.meta.url),
    'utf8',
  );
  const preview = {
    snapshot,
    problems: [],
    findings: [{ code: 'issue-not-open', level: 'block' }],
    origin: { kind: 'seed' },
    document: null,
  };

  it('refuses a student reviewer, a submitter and a visitor without asking a use case', async () => {
    expect(await previewPage('2026-11-09')).toBeNull();
    for (const who of ['student', 'submitter'] as const) {
      as(who);
      expect(await previewPage('2026-11-09')).toBeNull();
    }
    expect(runRegistered).not.toHaveBeenCalled();
  });

  it('is null for a Monday outside the calendar', async () => {
    as('headmaster');
    answer({ 'issues.workspace': { working: null, slot: null } });
    expect(await previewPage('2030-01-07')).toBeNull();
  });

  it('lets the headmaster back to the workspace and a staff reviewer only read', async () => {
    answer({ 'issues.workspace': { working: null, slot: SLOT }, 'issues.preview': preview });
    as('headmaster');
    const page = await previewPage('2026-11-09');
    expect(page).toMatchObject({
      monday: '2026-11-09',
      meeting: 'středa 11. listopadu 2026',
      canEdit: true,
      findings: preview.findings,
    });
    expect(page?.document).not.toBeNull();
    as('staff');
    expect(await previewPage('2026-11-09')).toMatchObject({ canEdit: false });
  });

  it('offers the headmaster alone the generate form of an open porada, blocked by a block finding', async () => {
    answer({ 'issues.workspace': { working: null, slot: SLOT }, 'issues.preview': preview });
    as('headmaster');
    expect((await previewPage('2026-11-09'))?.generate).toEqual({
      monday: '2026-11-09',
      version: 3,
      blocked: true,
    });
    answer({
      'issues.workspace': { working: null, slot: SLOT },
      'issues.preview': { ...preview, findings: [{ code: 'deadline-ahead', level: 'warn' }] },
    });
    expect((await previewPage('2026-11-09'))?.generate).toMatchObject({ blocked: false });
    as('staff');
    expect((await previewPage('2026-11-09'))?.generate).toBeNull();
  });

  it('names the document of a generated porada and offers no generate form', async () => {
    as('headmaster');
    const document = { generatedAt: '2026-11-09T13:05:00.000Z', pdfStatus: 'pending' };
    answer({
      'issues.workspace': { working: null, slot: { ...SLOT, status: 'generated' } },
      'issues.preview': { ...preview, findings: [], origin: { kind: 'stored' }, document },
    });
    expect(await previewPage('2026-11-09')).toMatchObject({
      generate: null,
      generated: { date: '9. 11. 2026', time: '14:05', pdf: 'pending' },
    });
  });

  it('has no document where the snapshot is missing or invalid', async () => {
    as('headmaster');
    answer({
      'issues.workspace': { working: null, slot: SLOT },
      'issues.preview': { ...preview, snapshot: null },
    });
    expect((await previewPage('2026-11-09'))?.document).toBeNull();
    answer({
      'issues.workspace': { working: null, slot: SLOT },
      'issues.preview': { ...preview, snapshot: JSON.stringify({ nonsense: true }) },
    });
    expect((await previewPage('2026-11-09'))?.document).toBeNull();
  });
});

describe('archivePage', () => {
  it('is null for a student reviewer, a submitter and a visitor without asking a use case', async () => {
    expect(await archivePage({})).toBeNull();
    for (const who of ['student', 'submitter'] as const) {
      as(who);
      expect(await archivePage({})).toBeNull();
    }
    expect(runRegistered).not.toHaveBeenCalled();
  });

  it('writes each generated porada out for the staff', async () => {
    answer({
      'documents.archive': {
        documents: [
          {
            monday: '2026-11-09',
            meetingDate: '2026-11-11',
            generatedAt: '2026-11-09T13:05:00.000Z',
            pdfStatus: 'failed',
            pdfFailure: 'refused',
          },
        ],
      },
    });
    for (const who of ['headmaster', 'staff'] as const) {
      as(who);
      expect(await archivePage({})).toEqual({
        problem: null,
        documents: [
          {
            monday: '2026-11-09',
            meeting: 'středa 11. listopadu 2026',
            date: '9. 11. 2026',
            time: '14:05',
            pdf: 'failed',
            pdfFailure: 'refused',
          },
        ],
      });
    }
  });

  describe('the reason a download gave no file (chyba)', () => {
    const problem = async (params: Record<string, string | string[] | undefined>) => {
      as('headmaster');
      answer({ 'documents.archive': { documents: [] } });
      return (await archivePage(params))?.problem;
    };

    it.each([
      'database-down',
      'timeout',
      'database-setup',
      'stored-data',
      'bug',
      'not-found',
      'rate-limited',
    ])('reads %s', async (chyba) => {
      expect(await problem({ chyba })).toBe(chyba);
    });

    it('reads the first of a repeated parameter', async () => {
      expect(await problem({ chyba: ['timeout', 'bug'] })).toBe('timeout');
    });

    it.each([undefined, '', 'forbidden', 'unauthenticated', 'Timeout', 'x'.repeat(5000), ['x']])(
      'ignores %j',
      async (chyba) => {
        expect(await problem({ chyba })).toBeNull();
      },
    );

    it('shows the list under the reason', async () => {
      as('staff');
      answer({ 'documents.archive': { documents: [] } });
      expect(await archivePage({ chyba: 'timeout' })).toEqual({
        problem: 'timeout',
        documents: [],
      });
    });
  });
});

const READ = {
  monday: '2026-11-09',
  meetingDate: '2026-11-09',
  version: 4,
  origin: { kind: 'derived', from: '2026-11-02' },
  pokyny: [],
  hospodareni: [],
};
const ID = '0192f000-0000-7000-8000-000000000005';

describe('outlinePage', () => {
  it('is null for anyone but the headmaster, without asking a use case', async () => {
    for (const who of ['staff', 'student', 'submitter'] as const) {
      as(who);
      expect(await outlinePage('2026-11-09')).toBeNull();
    }
    expect(runRegistered).not.toHaveBeenCalled();
  });

  it('writes where a derived list comes from, and passes the version on', async () => {
    as('headmaster');
    answer({ 'outline.read': READ });
    expect(await outlinePage('2026-11-09')).toEqual({
      meeting: 'pondělí 9. listopadu 2026',
      origin: { kind: 'derived', from: '2. 11. 2026' },
      view: { monday: '2026-11-09', version: 4, pokyny: [], hospodareni: [] },
    });
    answer({ 'outline.read': { ...READ, version: null, origin: { kind: 'seed', from: null } } });
    expect(await outlinePage('2026-11-09')).toMatchObject({ origin: { kind: 'seed' } });
  });

  it('is null where the Monday is not found', async () => {
    as('headmaster');
    answer({ 'outline.read': { error: { code: 'not-found' } } });
    expect(await outlinePage('2030-01-07')).toBeNull();
  });
});

describe('outlineItemPage and newOutlineItemPage', () => {
  const item = {
    monday: '2026-11-09',
    version: 5,
    lineageId: ID,
    section: 'pokyny',
    slot: null,
    persistence: 'standing',
    title: 'Pokyn',
    body: { type: 'doc', content: [] },
    quotes: [],
    proposal: null,
  };

  it('are null for anyone but the headmaster', async () => {
    for (const who of ['staff', 'student', 'submitter'] as const) {
      as(who);
      expect(await outlineItemPage('2026-11-09', ID)).toBeNull();
      expect(await newOutlineItemPage('2026-11-09', 'pokyny')).toBeNull();
    }
    expect(runRegistered).not.toHaveBeenCalled();
  });

  it('gives the editor the context, the school year and the item’s own version', async () => {
    as('headmaster');
    answer({ 'outline.read': READ, 'outline.item': item });
    expect(await outlineItemPage('2026-11-09', ID)).toEqual({
      kind: 'item',
      context: {
        meeting: 'pondělí 9. listopadu 2026',
        monday: '2026-11-09',
        version: 5,
        schoolYear: '2026/2027',
      },
      item: {
        lineageId: ID,
        section: 'pokyny',
        slot: null,
        persistence: 'standing',
        title: 'Pokyn',
        body: { type: 'doc', content: [] },
        quotes: [],
      },
    });
  });

  it('sends a proposal row to its review', async () => {
    as('headmaster');
    const pointId = '1c1d2e3f-4051-4263-8475-8697a8b9cadb';
    answer({ 'outline.read': READ, 'outline.item': { ...item, proposal: { pointId } } });
    expect(await outlineItemPage('2026-11-09', ID)).toEqual({ kind: 'proposal', pointId });
  });

  it('is null for an unknown item, and a new item carries the section', async () => {
    as('headmaster');
    answer({ 'outline.read': READ, 'outline.item': { error: { code: 'not-found' } } });
    expect(await outlineItemPage('2026-11-09', ID)).toBeNull();
    expect(await newOutlineItemPage('2026-11-09', 'hospodareni')).toMatchObject({
      section: 'hospodareni',
      context: { version: 4, schoolYear: '2026/2027' },
    });
  });
});

describe('issueTextsPage', () => {
  const texts = {
    monday: '2026-11-09',
    meetingDate: '2026-11-11',
    version: null,
    present: 'Jana',
    guests: '',
    annex2: { type: 'doc', content: [] },
    carried: { present: true, guests: true, annex2: true },
  };

  it('is null for anyone but the headmaster', async () => {
    for (const who of ['staff', 'student', 'submitter'] as const) {
      as(who);
      expect(await issueTextsPage('2026-11-09')).toBeNull();
    }
    expect(runRegistered).not.toHaveBeenCalled();
  });

  it('carries the texts, the flags and the meeting date written out', async () => {
    as('headmaster');
    answer({ 'issues.texts': texts });
    expect(await issueTextsPage('2026-11-09')).toEqual({
      meeting: 'středa 11. listopadu 2026',
      monday: '2026-11-09',
      version: null,
      present: 'Jana',
      guests: '',
      annex2: { type: 'doc', content: [] },
      carried: texts.carried,
    });
  });

  it('is null where the Monday is not found', async () => {
    as('headmaster');
    answer({ 'issues.texts': { error: { code: 'not-found' } } });
    expect(await issueTextsPage('2030-01-07')).toBeNull();
  });
});

describe('missingReportsPage', () => {
  const listing = {
    monday: '2026-11-09',
    meetingDate: '2026-11-11',
    open: true,
    reports: [
      {
        id: 'a-1',
        title: 'Seminář',
        startDate: '2026-11-04',
        endDate: null,
        state: 'none',
        paragraph: 'Dne 4. 11. 2026 proběhla akce s názvem Seminář.',
        original: 'Dne 4. 11. 2026 proběhla akce s názvem Seminář.',
        own: false,
        version: 0,
      },
      {
        id: 'a-2',
        title: 'Výlet',
        startDate: '2026-11-05',
        endDate: '2026-11-06',
        state: 'draft',
        paragraph: 'Vlastní věta.',
        original: 'Dne 5. 11. 2026 proběhla akce s názvem Výlet.',
        own: true,
        version: 2,
      },
    ],
  };

  it('is null for anyone but the headmaster, without asking a use case', async () => {
    for (const who of ['staff', 'student', 'submitter'] as const) {
      as(who);
      expect(await missingReportsPage('2026-11-09')).toBeNull();
    }
    expect(runRegistered).not.toHaveBeenCalled();
  });

  it('writes the meeting and each akce’s dates out, and carries the rest as read', async () => {
    as('headmaster');
    answer({ 'issues.missingReports': listing });
    expect(await missingReportsPage('2026-11-09')).toEqual({
      meeting: 'středa 11. listopadu 2026',
      monday: '2026-11-09',
      open: true,
      lines: ['Seznam účastníků nebyl dodán.', 'Vyjádření organizátora nebylo dodáno.'],
      reports: [
        {
          id: 'a-1',
          title: 'Seminář',
          dates: '4. 11. 2026',
          state: 'none',
          paragraph: 'Dne 4. 11. 2026 proběhla akce s názvem Seminář.',
          original: 'Dne 4. 11. 2026 proběhla akce s názvem Seminář.',
          own: false,
          version: 0,
        },
        {
          id: 'a-2',
          title: 'Výlet',
          dates: '5.–6. 11. 2026',
          state: 'draft',
          paragraph: 'Vlastní věta.',
          original: 'Dne 5. 11. 2026 proběhla akce s názvem Výlet.',
          own: true,
          version: 2,
        },
      ],
    });
  });

  it('keeps the closed porada, which has no form', async () => {
    as('headmaster');
    answer({ 'issues.missingReports': { ...listing, open: false, reports: [] } });
    expect(await missingReportsPage('2026-11-09')).toMatchObject({ open: false, reports: [] });
  });

  it('is null where the Monday is not found', async () => {
    as('headmaster');
    answer({ 'issues.missingReports': { error: { code: 'not-found' } } });
    expect(await missingReportsPage('2030-01-07')).toBeNull();
  });
});
