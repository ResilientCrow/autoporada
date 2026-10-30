import { describe, expect, inject, it } from 'vitest';

import {
  DatabaseFailure,
  ScopeViolation,
  StaleVersion,
  system,
  type FutureContent,
  type FutureItemPatch,
  type FutureItemRecord,
  type NewFutureItem,
  type Principal,
  type Tx,
  type UserRecord,
} from '@/application/ports';
import { calDate, wallTime } from '@/domain/time';

import { UnauditedWrite } from '../support/world/fake/oracle';
import { erasureRefusedBy, setupWorld } from '../support/world';

const world = setupWorld();
const cli = system('cli:test');
const UNKNOWN_ID = '00000000-0000-7000-8000-999999999999';

let refs = 0;
const nextRef = () => `00000000-0000-4000-8000-${String(++refs).padStart(12, '0')}`;

const EMPTY: FutureContent = {
  title: '',
  startDate: null,
  endDate: null,
  timeFrom: null,
  timeTo: null,
  campus: null,
  place: null,
  responsible: null,
  expectsReport: false,
};

/** Every field filled: an akce that expects a report. */
const FULL: FutureContent = {
  title: 'Výlet do Prahy',
  startDate: calDate(2026, 11, 10),
  endDate: calDate(2026, 11, 11),
  timeFrom: wallTime(8, 0),
  timeTo: wallTime(14, 30),
  campus: 'radlice',
  place: 'v Národním muzeu',
  responsible: {
    verb: 'zajišťuje',
    behalfOf: '2.A',
    people: [
      { salutation: 'pan', titlesBefore: 'Mgr.', givenName: 'Jan', familyName: 'Novák' },
      { salutation: null, givenName: 'Eva', familyName: 'Malá', affiliation: '3.B' },
    ],
  },
  expectsReport: true,
};

/** A jednání cannot expect a report. */
const JEDNANI: FutureContent = { ...FULL, expectsReport: false };

const SUBMIT: FutureItemPatch = {
  content: FULL,
  state: 'submitted',
  submittedAt: new Date('2026-10-19T09:00:00Z'),
};

/** Runs a write and names the item in an audit event, as a use case would. */
const audited = (by: Principal, work: (tx: Tx) => Promise<FutureItemRecord>) =>
  world.tx(by, async (tx) => {
    const item = await work(tx);
    await tx.audit.record({ action: 'future.save', target: { type: 'future_item', id: item.id } });
    return item;
  });

const create = async (by: Principal, over: Partial<NewFutureItem> = {}) => {
  let inserted = false;
  const item = await audited(by, async (tx) => {
    const result = await tx.futureItems.create({
      clientRef: nextRef(),
      kind: 'akce',
      content: EMPTY,
      ...over,
    });
    inserted = result.inserted;
    return result.item;
  });
  return { item, inserted };
};

const update = (
  by: Principal,
  item: FutureItemRecord,
  patch: FutureItemPatch,
  version = item.version,
) => audited(by, (tx) => tx.futureItems.update(item.id, version, patch));

const read = <T>(by: Principal, work: (tx: Tx) => Promise<T>) => world.tx(by, work, 'read');
const failure = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: unknown) => error,
  );

describe('FutureItemRepo (port contract)', () => {
  it('creates a draft at version 1 and gives the same row back for the same clientRef', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const other = await world.seed.user({ role: 'submitter' });
    const clientRef = nextRef();
    // The ref is the author's: a colleague's earlier item with it stays theirs.
    const theirs = await create(world.as(other), { clientRef });
    const first = await create(world.as(author), { clientRef, content: FULL });
    expect(first.inserted).toBe(true);
    expect(first.item).toEqual({
      id: first.item.id,
      kind: 'akce',
      authorId: author.id,
      state: 'draft',
      content: FULL,
      reportState: 'none',
      reportPointId: null,
      submittedAt: null,
      version: 1,
      updatedAt: world.clock.now(),
    });
    world.clock.advance(60_000);
    const again = await create(world.as(author), { clientRef, content: EMPTY });
    expect(again).toEqual({ item: first.item, inserted: false });
    expect(theirs.item.id).not.toBe(first.item.id);
  });

  it('reads back a jednání with nothing filled in', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const { item } = await create(world.as(author), { kind: 'jednani' });
    expect(await read(world.as(author), (tx) => tx.futureItems.get(item.id))).toEqual(item);
    expect(item).toMatchObject({ kind: 'jednani', content: EMPTY });
  });

  it('refuses the system as an author', async () => {
    const refused = world.tx(cli, (tx) =>
      tx.futureItems.create({ clientRef: nextRef(), kind: 'akce', content: EMPTY }),
    );
    expect(await failure(refused)).toBeInstanceOf(ScopeViolation);
  });

  it('updates against the expected version, raises it by one and keeps unpatched fields', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const { item } = await create(world.as(author));
    world.clock.advance(60_000);
    const saved = await update(world.as(author), item, { content: FULL });
    expect(saved).toEqual({ ...item, content: FULL, version: 2, updatedAt: world.clock.now() });
    const submitted = await update(world.as(author), saved, SUBMIT);
    expect(submitted).toMatchObject({
      state: 'submitted',
      submittedAt: SUBMIT.submittedAt,
      version: 3,
    });
    const retracted = await update(world.as(author), submitted, {
      state: 'draft',
      submittedAt: null,
    });
    expect(retracted).toEqual({ ...submitted, state: 'draft', submittedAt: null, version: 4 });
    expect(await read(world.as(author), (tx) => tx.futureItems.get(item.id))).toEqual(retracted);
  });

  it('clears an optional field when the content says null', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const { item } = await create(world.as(author), { content: FULL });
    const cleared = await update(world.as(author), item, {
      content: { ...FULL, endDate: null, timeTo: null, place: null, responsible: null },
    });
    expect(cleared.content).toMatchObject({ endDate: null, timeTo: null, place: null });
    expect(cleared.content.responsible).toBeNull();
  });

  it('refuses a stale version and an unknown item with StaleVersion, writing nothing', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const { item } = await create(world.as(author));
    await update(world.as(author), item, { content: FULL });
    expect(await failure(update(world.as(author), item, { content: EMPTY }))).toBeInstanceOf(
      StaleVersion,
    );
    const unknown = { ...item, id: UNKNOWN_ID };
    expect(await failure(update(world.as(author), unknown, {}))).toBeInstanceOf(StaleVersion);
    const stored = await read(world.as(author), (tx) => tx.futureItems.get(item.id));
    expect(stored).toMatchObject({ content: FULL, version: 2 });
  });

  it('holds the row lock from loadForWrite until the transaction ends', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const { item } = await create(world.as(author));
    const order: string[] = [];
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let locked = () => {};
    const isLocked = new Promise<void>((resolve) => {
      locked = resolve;
    });
    const first = world.tx(world.as(author), async (tx) => {
      expect(await tx.futureItems.loadForWrite(item.id)).toEqual(item);
      order.push('first locked');
      locked();
      await held;
      order.push('first done');
    });
    await isLocked;
    const second = world.tx(world.as(author), async (tx) => {
      await tx.futureItems.loadForWrite(item.id);
      order.push('second locked');
    });
    if (world.pg) {
      const pg = world.pg;
      await expect.poll(() => pg.lockWaits(), { timeout: 5_000 }).toBe(1);
    } else {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(order).toEqual(['first locked']);
    release();
    await Promise.all([first, second]);
    expect(order).toEqual(['first locked', 'first done', 'second locked']);
  });

  it('refuses loadForWrite in a read transaction', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const { item } = await create(world.as(author));
    const refused = await failure(
      read(world.as(author), (tx) => tx.futureItems.loadForWrite(item.id)),
    );
    expect(refused).toEqual(new DatabaseFailure('25006'));
  });

  it('lists the items in scope, last changed first, ties to the higher id, up to the limit', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const as = world.as(author);
    const first = await create(as);
    world.clock.advance(60_000);
    const second = await create(as);
    const third = await create(as);
    world.clock.advance(60_000);
    const touched = await update(as, first.item, { content: FULL });
    const tied = [second.item.id, third.item.id].sort((a, b) => (a < b ? 1 : -1));
    const listed = await read(as, (tx) => tx.futureItems.list(10));
    expect(listed.map((i) => i.id)).toEqual([touched.id, ...tied]);
    expect(await read(as, (tx) => tx.futureItems.list(2))).toHaveLength(2);
  });

  it('keeps a user who wrote an item: erasing them is refused', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const { item } = await create(world.as(author));
    expect(await failure(world.erase.user(author.id))).toMatchObject(
      erasureRefusedBy(world.kind, 'future_items_author_id_users_id_fk'),
    );
    expect(await read(cli, (tx) => tx.users.get(author.id))).toEqual(author);
    expect(await read(cli, (tx) => tx.futureItems.get(item.id))).toEqual(item);
  });

  /** Each case is one row the CHECKs refuse, by the constraint that does. */
  describe('surfaces a refused row by its constraint name', () => {
    it.each<[string, FutureContent, Partial<NewFutureItem>]>([
      ['future_items_dates', { ...EMPTY, endDate: calDate(2026, 11, 1) }, {}],
      [
        'future_items_dates',
        { ...EMPTY, startDate: calDate(2026, 11, 2), endDate: calDate(2026, 11, 1) },
        {},
      ],
      ['future_items_expects_akce', { ...EMPTY, expectsReport: true }, { kind: 'jednani' }],
      ['future_items_lengths', { ...EMPTY, title: 'x'.repeat(201) }, {}],
      ['future_items_lengths', { ...EMPTY, place: 'x'.repeat(121) }, {}],
    ])('%s', async (constraint, content, over) => {
      const author = await world.seed.user({ role: 'submitter' });
      const refused = create(world.as(author), { content, ...over });
      expect(await failure(refused)).toEqual(new DatabaseFailure(`db.constraint.${constraint}`));
      expect(await read(cli, (tx) => tx.futureItems.list(10))).toEqual([]);
    });

    it('accepts the lengths at their caps', async () => {
      const author = await world.seed.user({ role: 'submitter' });
      const content = { ...EMPTY, title: 'ž'.repeat(200), place: 'ž'.repeat(120) };
      expect((await create(world.as(author), { content })).item.content).toEqual(content);
    });

    it.each<[string, FutureItemPatch]>([
      ['no title', { ...SUBMIT, content: { ...FULL, title: '' } }],
      ['no start date', { ...SUBMIT, content: { ...FULL, startDate: null, endDate: null } }],
      ['not handed in', { state: 'approved' }],
    ])('future_items_submitted_complete: %s', async (_name, patch) => {
      const author = await world.seed.user({ role: 'submitter' });
      const { item } = await create(world.as(author), { content: FULL });
      const refused = update(world.as(author), item, patch);
      expect(await failure(refused)).toEqual(
        new DatabaseFailure('db.constraint.future_items_submitted_complete'),
      );
      expect(await read(cli, (tx) => tx.futureItems.get(item.id))).toEqual(item);
    });

    it('future_items_author_id_users_id_fk', async () => {
      const author = await world.seed.user({ role: 'submitter' });
      const ghost = world.as({ ...author, id: UNKNOWN_ID });
      const refused = create(ghost);
      expect(await failure(refused)).toEqual(
        new DatabaseFailure('db.constraint.future_items_author_id_users_id_fk'),
      );
    });

    it('the CHECKs come before the foreign key', async () => {
      const author = await world.seed.user({ role: 'submitter' });
      const ghost = world.as({ ...author, id: UNKNOWN_ID });
      const refused = create(ghost, { content: { ...EMPTY, endDate: calDate(2026, 11, 1) } });
      expect(await failure(refused)).toEqual(
        new DatabaseFailure('db.constraint.future_items_dates'),
      );
    });
  });
});

describe('FutureItemRepo responsible', () => {
  /** Content the contract refuses, as a caller that skipped Zod could hand it over. */
  const REFUSED: [string, unknown][] = [
    ['an unknown verb', { verb: 'řídí', people: [] }],
    ['a stray key', { verb: 'vede', people: [], note: 'x' }],
    [
      'a person without a family name',
      { verb: 'vede', people: [{ salutation: null, givenName: 'Eva' }] },
    ],
  ];
  const withResponsible = (responsible: unknown) =>
    ({ ...FULL, responsible }) as unknown as FutureContent;

  it.each(REFUSED)('refuses %s before writing, as db.parse.future_items', async (_name, bad) => {
    const author = await world.seed.user({ role: 'submitter' });
    const parse = new DatabaseFailure('db.parse.future_items');
    expect(await failure(create(world.as(author), { content: withResponsible(bad) }))).toEqual(
      parse,
    );
    const { item } = await create(world.as(author), { content: FULL });
    const refused = update(world.as(author), item, { content: withResponsible(bad) });
    expect(await failure(refused)).toEqual(parse);
    expect(await read(world.as(author), (tx) => tx.futureItems.get(item.id))).toEqual(item);
  });

  it('parses before it looks for the clientRef or the version', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const parse = new DatabaseFailure('db.parse.future_items');
    const clientRef = nextRef();
    const { item } = await create(world.as(author), { clientRef });
    const bad = withResponsible(REFUSED[0]![1]);
    expect(await failure(create(world.as(author), { clientRef, content: bad }))).toEqual(parse);
    const stale = update(world.as(author), item, { content: bad }, item.version + 1);
    expect(await failure(stale)).toEqual(parse);
  });

  it('keeps what the contract accepts, a null and a bare verb included', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const bare = { verb: 'vede', people: [] } as const;
    const { item } = await create(world.as(author), { content: { ...FULL, responsible: bare } });
    expect(item.content.responsible).toEqual(bare);
    const cleared = await update(world.as(author), item, {
      content: { ...FULL, responsible: null },
    });
    expect(cleared.content.responsible).toBeNull();
  });
});

describe('FutureItemRepo scope', () => {
  /** Items of one author in every standing that matters, made through the port. */
  const items = async (author: UserRecord) => {
    const as = world.as(author);
    const made = async (kind: NewFutureItem['kind'], ...patches: FutureItemPatch[]) => {
      let { item } = await create(as, { kind, content: kind === 'akce' ? FULL : JEDNANI });
      for (const patch of patches) item = await update(as, item, patch);
      return item;
    };
    const handedIn = { ...SUBMIT, content: JEDNANI };
    return {
      draft: await made('akce'),
      retracted: await made('akce', SUBMIT, { state: 'draft', submittedAt: null }),
      submitted: await made('akce', SUBMIT),
      returned: await made('akce', SUBMIT, { state: 'returned' }),
      approvedAkce: await made('akce', SUBMIT, { state: 'approved' }),
      cancelledAkce: await made('akce', SUBMIT, { state: 'approved' }, { state: 'cancelled' }),
      rejected: await made('akce', SUBMIT, { state: 'rejected' }),
      approvedJednani: await made('jednani', handedIn, { state: 'approved' }),
    };
  };
  type Standing = keyof Awaited<ReturnType<typeof items>>;

  /** What `by` reads; the author and the system also lock what they read, nobody else does (F3). */
  const seen = async (
    by: Principal,
    all: Record<Standing, FutureItemRecord>,
    authorId?: string,
  ) => {
    const visible: string[] = [];
    const listed = await read(by, (tx) => tx.futureItems.list(50));
    const writes = by.kind === 'system' || by.actor.id === authorId;
    for (const [standing, item] of Object.entries(all)) {
      const got = await read(by, (tx) => tx.futureItems.get(item.id));
      const locked = await world.tx(by, (tx) => tx.futureItems.loadForWrite(item.id));
      expect(locked, standing).toEqual(writes ? got : null);
      expect(
        listed.some((i) => i.id === item.id),
        standing,
      ).toBe(got !== null);
      if (got) {
        expect(got, standing).toEqual(item);
        visible.push(standing);
      }
    }
    return visible;
  };

  it('shows the author everything and the system everything', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const all = await items(author);
    expect(await seen(world.as(author), all, author.id)).toEqual(Object.keys(all));
    expect(await seen(cli, all)).toEqual(Object.keys(all));
  });

  it('shows a reviewer or the headmaster the submitted items, whatever has become of them', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const all = await items(author);
    for (const role of ['reviewer', 'headmaster'] as const) {
      const reviewer = world.as(await world.seed.user({ role }));
      expect(await seen(reviewer, all), role).toEqual([
        'submitted',
        'returned',
        'approvedAkce',
        'cancelledAkce',
        'rejected',
        'approvedJednani',
      ]);
    }
  });

  it('shows a teacher or a student the approved akce of a colleague and nothing else of theirs', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const all = await items(author);
    const teacher = await world.seed.user({ role: 'submitter' });
    const student = await world.seed.user({ role: 'submitter', isStudent: true });
    for (const reader of [teacher, student]) {
      expect(await seen(world.as(reader), all)).toEqual(['approvedAkce']);
    }
    const own = await create(world.as(student));
    expect(await read(world.as(student), (tx) => tx.futureItems.get(own.item.id))).toEqual(
      own.item,
    );
  });

  it('shows a blocked user nothing', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const all = await items(author);
    const blocked = await world.seed.user({ role: 'submitter', status: 'blocked' });
    expect(await seen(world.as(blocked), all)).toEqual([]);
  });

  it('does not let a reviewer write an item outside their scope', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const { draft } = await items(author);
    const reviewer = await world.seed.user({ role: 'reviewer' });
    const refused = update(world.as(reviewer), draft, { state: 'withdrawn' });
    expect(await failure(refused)).toBeInstanceOf(StaleVersion);
  });

  /**
   * The write scope is the author's alone (the system aside): what a colleague or a reviewer
   * reads is not theirs to lock or move. Row 55 gives the reviewers a path of their own for
   * the decisions; until then the use cases' author checks have a second line behind them.
   */
  it('lets only the author lock and update an item, whoever may read it', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const { submitted, approvedAkce } = await items(author);
    const teacher = await world.seed.user({ role: 'submitter' });
    const student = await world.seed.user({ role: 'submitter', isStudent: true });
    const reviewer = await world.seed.user({ role: 'reviewer' });
    const headmaster = await world.seed.user({ role: 'headmaster' });
    const readers: [string, UserRecord, FutureItemRecord][] = [
      ['teacher', teacher, approvedAkce],
      ['student', student, approvedAkce],
      ['reviewer', reviewer, submitted],
      ['headmaster', headmaster, submitted],
    ];
    for (const [who, reader, item] of readers) {
      const by = world.as(reader);
      expect(await read(by, (tx) => tx.futureItems.get(item.id)), who).toEqual(item);
      expect(await world.tx(by, (tx) => tx.futureItems.loadForWrite(item.id)), who).toBeNull();
      const refused = update(by, item, { state: 'withdrawn' });
      expect(await failure(refused), who).toBeInstanceOf(StaleVersion);
      expect(await read(cli, (tx) => tx.futureItems.get(item.id)), who).toEqual(item);
    }
    const moved = await update(world.as(author), approvedAkce, { state: 'cancelled' });
    expect(moved.version).toBe(approvedAkce.version + 1);
    const cancelled = await update(cli, moved, { state: 'cancelled' });
    expect(cancelled.version).toBe(moved.version + 1);
  });
});

describe.runIf(inject('world') === 'fake')('future item audit coverage in the fake world', () => {
  it('names every created or updated item as a written row', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const unaudited = (work: (tx: Tx) => Promise<unknown>) =>
      failure(world.tx(world.as(author), work));
    const newItem = { clientRef: nextRef(), kind: 'akce', content: EMPTY } as const;
    expect(await unaudited((tx) => tx.futureItems.create(newItem))).toBeInstanceOf(UnauditedWrite);
    const { item } = await create(world.as(author));
    expect(await unaudited((tx) => tx.futureItems.update(item.id, 1, {}))).toBeInstanceOf(
      UnauditedWrite,
    );
  });
});
