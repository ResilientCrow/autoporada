import { describe, expect, it, vi } from 'vitest';

import type { UserPrincipal } from '@/application/ports';
import type { Tier, UserFunction } from '@/domain/actor';
import { calDate } from '@/domain/time';

import type { WebContainer } from '../container';
import { archState } from './arch-state';

// The staff reads of an open porada go through the use cases; none is wired in these tests.
vi.mock('../pipeline', () => ({ runRegistered: vi.fn(async () => ({ ok: false })) }));

const VIEWER = '00000000-0000-4000-8000-0000000000a1';
const OTHER = '00000000-0000-4000-8000-0000000000b2';
const principal: UserPrincipal = {
  kind: 'user',
  actor: { id: VIEWER, role: 'submitter', status: 'active', isStudent: false },
  sessionId: 'test',
  authTime: new Date('2026-10-20T07:00:00Z'),
};

const issue = (monday: string, meetingDate: string, status: 'open' | 'generated') => ({
  id: `issue-${monday}`,
  monday,
  meetingDate,
  deadlineAt: new Date(`${meetingDate}T16:00:00Z`),
  presentText: null as string | null,
  guestsText: null as string | null,
  annex2: null as unknown,
  status,
  version: 1,
});
const GENERATED = issue('2026-10-12', '2026-10-15', 'generated');
const OPEN = issue('2026-10-19', '2026-10-22', 'open');

const pointRow = (
  id: string,
  state: string,
  authorId: string,
  handIn: string | null,
  futureItemId: string | null = null,
) => ({
  id,
  kind: 'report',
  authorId,
  state,
  content: {},
  futureItemId,
  handInMonday: handIn
    ? calDate(...(handIn.split('-').map(Number) as [number, number, number]))
    : null,
  submittedAt: handIn ? new Date('2026-10-01T10:00:00Z') : null,
  version: 1,
  updatedAt: new Date('2026-10-02T10:00:00Z'),
});

const futureRow = (id: string, state: string, lastDay: [number, number, number]) => ({
  id,
  kind: 'akce',
  authorId: OTHER,
  state,
  content: {
    title: id,
    startDate: calDate(...lastDay),
    endDate: null,
    timeFrom: null,
    timeTo: null,
    campus: null,
    place: null,
    organizer: null,
    organizerRole: null,
    participants: null,
    participantsAddress: null,
    note: null,
  },
  reportState: 'none',
  reportPointId: null,
  submittedAt: new Date('2026-09-01T10:00:00Z'),
  cancelRequestedAt: null,
  version: 1,
  updatedAt: new Date('2026-09-02T10:00:00Z'),
});

const documentRow = (issueId: string, version: number, pdfStatus = 'ready') => ({
  issueId,
  version,
  pdfStatus,
  pdfFailure: pdfStatus === 'failed' ? 'convert' : null,
  generatedAt: new Date('2026-10-15T18:00:00Z'),
});

const userRow = (
  id: string,
  tier: Tier | null,
  over: { role?: string; status?: string; salutation?: 'pan' | 'pani' | 'slecna' | null } = {},
) => ({
  id,
  version: 1,
  displayName: `Jana ${id}`,
  email: `${id}@ssps.cz`,
  role: over.role ?? 'submitter',
  status: over.status ?? 'active',
  tier,
  salutation: over.salutation ?? null,
  titlesBefore: null,
  titlesAfter: null,
  jobTitle: null,
  department: null,
});

const reviewer: UserPrincipal = {
  ...principal,
  actor: { ...principal.actor, role: 'reviewer' },
};

/** A container whose store hands back a superset, as the real one may, and records what is asked. */
function containerWith(opts: {
  issues: ReturnType<typeof issue>[];
  points: ReturnType<typeof pointRow>[];
  futures: ReturnType<typeof futureRow>[];
  documents?: ReturnType<typeof documentRow>[];
  annexes?: { monday: string; annexes: unknown }[];
  users?: ReturnType<typeof userRow>[];
  functions?: Map<string, UserFunction[]>;
  now?: string;
}) {
  const arch = {
    settings: async () => [],
    issues: async () => opts.issues,
    points: vi.fn(async () => opts.points),
    futures: vi.fn(async () => opts.futures),
    pointEvents: vi.fn(async (_ids: string[]) => []),
    futureEvents: vi.fn(async (_ids: string[]) => []),
    users: async () => opts.users ?? [],
    functions: vi.fn(
      async (_ids: string[] | null) => opts.functions ?? new Map<string, UserFunction[]>(),
    ),
    accessRequests: async () => [],
    placeholders: async () => [],
    issueItems: async () => [],
    registry: async () => ({ lists: [], entries: [] }),
    documents: vi.fn(async () => opts.documents ?? []),
    annexes: vi.fn(async (_mondays: string[]) => opts.annexes ?? []),
  };
  const c = { arch, app: { clock: { now: () => new Date(opts.now ?? '2026-10-20T08:00:00Z') } } };
  return { arch, c: c as unknown as WebContainer };
}

describe('archState: the live working set', () => {
  it('cuts the reads at the last generated porada and sends only live items and their events', async () => {
    const { arch, c } = containerWith({
      issues: [GENERATED, OPEN],
      points: [
        pointRow('p-submitted', 'submitted', OTHER, '2026-10-19'),
        pointRow('p-published-old', 'published', OTHER, '2026-10-05'),
        pointRow('p-own-draft', 'draft', VIEWER, null),
        pointRow('p-withdrawn', 'withdrawn', OTHER, '2026-10-19'),
        pointRow('p-refused-no-akce', 'rejected', OTHER, '2026-10-19'),
        pointRow('p-refused-live-akce', 'rejected', OTHER, '2026-10-19', 'f-ends-after'),
        pointRow('p-refused-gone-akce', 'rejected', OTHER, '2026-10-05', 'f-ended-before'),
        pointRow('p-own-refused', 'rejected', VIEWER, '2026-10-05'),
      ],
      futures: [
        futureRow('f-ended-before', 'approved', [2026, 10, 14]),
        futureRow('f-ends-after', 'approved', [2026, 10, 16]),
      ],
    });

    const state = await archState(c, principal, 'test');

    expect(arch.points).toHaveBeenCalledWith(
      expect.anything(),
      { monday: '2026-10-12', meetingDate: '2026-10-15' },
      ['f-ends-after'],
    );
    // Today (20 October) is after the meeting (15 October): live from the meeting day.
    expect(arch.futures).toHaveBeenCalledWith(expect.anything(), '2026-10-15');
    expect((state['points'] as { id: string }[]).map((p) => p.id).sort()).toEqual([
      'p-own-draft',
      'p-own-refused',
      'p-refused-live-akce',
      'p-submitted',
    ]);
    expect((state['futures'] as { id: string }[]).map((f) => f.id)).toEqual(['f-ends-after']);
    expect(arch.pointEvents.mock.calls[0]![0].sort()).toEqual([
      'p-own-draft',
      'p-own-refused',
      'p-refused-live-akce',
      'p-submitted',
    ]);
    expect(arch.futureEvents).toHaveBeenCalledWith(['f-ends-after']);
  });

  it('keeps a colleague’s approved akce that is not over between the generation and the meeting', async () => {
    // Tuesday 13 October: the porada of 12 October is generated, its meeting is on the 15th.
    const { arch, c } = containerWith({
      issues: [GENERATED, OPEN],
      points: [],
      futures: [
        futureRow('f-ended-yesterday', 'approved', [2026, 10, 12]),
        futureRow('f-ends-today', 'approved', [2026, 10, 13]),
        futureRow('f-ends-before-meeting', 'approved', [2026, 10, 14]),
      ],
      now: '2026-10-13T08:00:00Z',
    });

    const state = await archState(c, principal, 'test');

    expect(arch.futures).toHaveBeenCalledWith(expect.anything(), '2026-10-13');
    expect((state['futures'] as { id: string }[]).map((f) => f.id)).toEqual([
      'f-ends-today',
      'f-ends-before-meeting',
    ]);
  });

  it('sends everything not withdrawn before the first generation', async () => {
    const { arch, c } = containerWith({
      issues: [OPEN],
      points: [
        pointRow('p-published', 'published', OTHER, '2026-10-05'),
        pointRow('p-withdrawn', 'withdrawn', OTHER, '2026-10-19'),
      ],
      futures: [futureRow('f-old', 'approved', [2026, 1, 5])],
    });

    const state = await archState(c, principal, 'test');

    expect(arch.points).toHaveBeenCalledWith(expect.anything(), null, ['f-old']);
    expect(arch.futures).toHaveBeenCalledWith(expect.anything(), null);
    expect((state['points'] as { id: string }[]).map((p) => p.id)).toEqual(['p-published']);
    expect((state['futures'] as { id: string }[]).map((f) => f.id)).toEqual(['f-old']);
  });
});

describe('archState: generated poradas are metadata only', () => {
  const stored = (mondays: string[]) =>
    mondays.map((monday) => ({ monday, annexes: [{ id: `annex-${monday}` }] }));
  type IssueOut = {
    monday: string;
    present: string;
    guests: string;
    annex2: unknown;
    annexes: unknown[];
    placeholders: Record<string, string>;
    doc?: Record<string, unknown>;
  };
  const issuesOf = (state: Record<string, unknown>) =>
    new Map((state['issues'] as IssueOut[]).map((i) => [i.monday, i]));

  it('sends a generated porada with its document status and no content', async () => {
    const { c } = containerWith({
      issues: [
        { ...GENERATED, presentText: 'Přítomni', guestsText: 'Hosté', annex2: { type: 'doc' } },
        OPEN,
      ],
      points: [],
      futures: [],
      documents: [documentRow(GENERATED.id, 1, 'failed')],
      annexes: stored([GENERATED.monday, OPEN.monday]),
    });

    const out = issuesOf(await archState(c, reviewer, 'test')).get(GENERATED.monday)!;

    expect(out.doc).toEqual({
      at: '2026-10-15T18:00:00.000Z',
      by: '',
      pdf: 'failed',
      pdfFailure: 'convert',
    });
    expect(out.present).toBe('');
    expect(out.guests).toBe('');
    expect(out.annex2).toBeNull();
    expect(out.annexes).toEqual([]);
    expect(out.placeholders).toEqual({});
    expect(out).toMatchObject({
      own: { rows: false, present: false, guests: false, annex2: false },
    });
  });

  it('takes the document of the latest version', async () => {
    const { c } = containerWith({
      issues: [GENERATED],
      points: [],
      futures: [],
      documents: [documentRow(GENERATED.id, 1, 'rendering'), documentRow(GENERATED.id, 2, 'ready')],
    });

    const out = issuesOf(await archState(c, reviewer, 'test')).get(GENERATED.monday)!;

    expect(out.doc).toMatchObject({ pdf: 'ready' });
  });

  it('keeps the annexes and texts of an open porada', async () => {
    const { c } = containerWith({
      issues: [GENERATED, { ...OPEN, presentText: 'Přítomni' }],
      points: [],
      futures: [],
      annexes: stored([OPEN.monday]),
    });

    const out = issuesOf(await archState(c, reviewer, 'test')).get(OPEN.monday)!;

    expect(out.annexes).toEqual([{ id: 'annex-2026-10-19' }]);
    expect(out.present).toBe('Přítomni');
    expect(out.doc).toBeUndefined();
  });

  it('reads the annexes of the open Mondays only, wherever they sit in the calendar', async () => {
    const later = issue('2026-10-26', '2026-10-29', 'generated');
    const { arch, c } = containerWith({
      issues: [GENERATED, OPEN, later],
      points: [],
      futures: [],
    });

    await archState(c, reviewer, 'test');

    expect(arch.annexes).toHaveBeenCalledTimes(1);
    const asked = arch.annexes.mock.calls[0]![0];
    expect(asked).toContain(OPEN.monday);
    expect(asked).not.toContain(GENERATED.monday);
    expect(asked).not.toContain(later.monday);
  });

  it('reads nothing for a viewer who is not staff', async () => {
    const { arch, c } = containerWith({ issues: [GENERATED, OPEN], points: [], futures: [] });

    const state = await archState(c, principal, 'test');

    expect(arch.documents).not.toHaveBeenCalled();
    expect(arch.annexes).not.toHaveBeenCalled();
    expect(issuesOf(state).get(GENERATED.monday)!.doc).toBeUndefined();
  });
});

describe('archState: the functions (ADR 0072 item 4)', () => {
  const headmaster: UserPrincipal = {
    ...principal,
    actor: { ...principal.actor, role: 'headmaster' },
  };

  it('reads everyone’s functions for the headmaster and only the viewer’s own for anyone else', async () => {
    const asHead = containerWith({ issues: [GENERATED, OPEN], points: [], futures: [] });
    await archState(asHead.c, headmaster, 'test');
    expect(asHead.arch.functions).toHaveBeenCalledWith(null);

    const asReviewer = containerWith({ issues: [GENERATED, OPEN], points: [], futures: [] });
    await archState(asReviewer.c, reviewer, 'test');
    // Anyone who may write points reads them all, for the cards; `users` still shows their own.
    expect(asReviewer.arch.functions).toHaveBeenCalledWith(null);
  });
});

describe('archState: the cards (ADR 0072 item 7)', () => {
  const ZASTUPCE: UserFunction = { head: 'zastupce', complement: 'pro majetek' };
  const student: UserPrincipal = {
    ...principal,
    actor: { ...principal.actor, isStudent: true },
  };
  const pending: UserPrincipal = {
    ...principal,
    actor: { ...principal.actor, role: 'pending' },
  };
  const users = [
    userRow(VIEWER, 'ucitel', { salutation: 'pani' }),
    userRow(OTHER, 'vedeni', { role: 'reviewer', salutation: 'pan' }),
    userRow('eva', 'student', { salutation: 'slecna' }),
    userRow('cekajici', null, { role: 'pending' }),
    userRow('zablokovany', 'ucitel', { status: 'blocked' }),
  ];
  const functions = new Map<string, UserFunction[]>([[OTHER, [ZASTUPCE]]]);
  type CardOut = { id: string; head?: string; complement?: string };
  const cardsOf = (state: Record<string, unknown>) => state['cards'] as CardOut[];

  it('gives staff who write points a card for every active colleague, with what prints before the name', async () => {
    const { c } = containerWith({ issues: [OPEN], points: [], futures: [], users, functions });

    const cards = cardsOf(await archState(c, principal, 'test'));

    expect(cards.map((x) => x.id).sort()).toEqual([OTHER, VIEWER, 'eva'].sort());
    expect(cards.find((x) => x.id === OTHER)).toMatchObject({
      head: 'zastupce',
      complement: 'pro majetek',
    });
    expect(cards.find((x) => x.id === VIEWER)).toMatchObject({ head: 'profesor' });
  });

  it('keeps email, role, tier and functions out of a submitter’s cards and users', async () => {
    const { c } = containerWith({ issues: [OPEN], points: [], futures: [], users, functions });

    const state = await archState(c, principal, 'test');

    for (const card of cardsOf(state)) {
      for (const key of ['email', 'role', 'tier', 'functions', 'status', 'isStudent'])
        expect(card).not.toHaveProperty(key);
    }
    // The people rows stay as they were: a colleague nobody's point names is not in them.
    expect((state['users'] as { id: string }[]).map((u) => u.id)).toEqual([VIEWER, 'vedeni']);
  });

  it('gives a student their own card only and reads only their own functions', async () => {
    const { arch, c } = containerWith({
      issues: [OPEN],
      points: [],
      futures: [],
      users: [userRow(VIEWER, 'student', { salutation: 'slecna' }), ...users.slice(1)],
      functions,
    });

    const cards = cardsOf(await archState(c, student, 'test'));

    expect(cards.map((x) => x.id)).toEqual([VIEWER]);
    expect(arch.functions).toHaveBeenCalledWith([VIEWER]);
  });

  it('gives a viewer who may not write points no cards', async () => {
    const { c } = containerWith({ issues: [OPEN], points: [], futures: [], users, functions });

    expect(cardsOf(await archState(c, pending, 'test'))).toEqual([]);
  });
});
