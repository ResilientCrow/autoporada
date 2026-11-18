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
  organizer: null,
  organizerRole: null,
  participants: null,
  note: null,
};

/** Every field filled. */
const FULL: FutureContent = {
  title: 'Výlet do Prahy',
  startDate: calDate(2026, 11, 10),
  endDate: calDate(2026, 11, 11),
  timeFrom: wallTime(8, 0),
  timeTo: wallTime(14, 30),
  campus: 'radlice',
  place: 'v Národním muzeu',
  organizer: '2.A pan Mgr. Jan Novák',
  organizerRole: 'coordinates',
  participants: null,
  note: null,
};

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
      cancelRequestedAt: null,
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

  it('begins a create with the user’s own item for the clientRef and their draft count', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const colleague = await world.seed.user({ role: 'submitter' });
    const [mineRef, theirRef] = [nextRef(), nextRef()];
    const mine = await create(world.as(author), { clientRef: mineRef });
    await create(world.as(author), { kind: 'jednani' });
    const returned = await create(world.as(author));
    await update(world.as(author), returned.item, { ...SUBMIT, state: 'returned' });
    const handedIn = await create(world.as(author));
    await update(world.as(author), handedIn.item, SUBMIT);
    const theirs = await create(world.as(colleague), { clientRef: theirRef });
    const begin = (by: Principal, ref: string) =>
      world.tx(by, (tx) => tx.futureItems.beginCreate(ref));
    // Only a draft counts, and a colleague's items are not the user's.
    expect(await begin(world.as(author), mineRef)).toEqual({
      existing: mine.item,
      drafts: 2,
    });
    expect(await begin(world.as(author), nextRef())).toEqual({ existing: null, drafts: 2 });
    expect(await begin(world.as(colleague), theirRef)).toEqual({
      existing: theirs.item,
      drafts: 1,
    });
    expect(await failure(begin(cli, nextRef()))).toBeInstanceOf(ScopeViolation);
  });

  it('never begins a create on a colleague’s item with the same clientRef', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const colleague = await world.seed.user({ role: 'submitter' });
    const clientRef = nextRef();
    await create(world.as(colleague), { clientRef });
    const begin = await world.tx(world.as(author), (tx) => tx.futureItems.beginCreate(clientRef));
    expect(begin).toEqual({ existing: null, drafts: 0 });
  });

  it('begins a submit with how many of the user’s items are submitted, and no other state', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const colleague = await world.seed.user({ role: 'submitter' });
    const begin = (by: Principal) => world.tx(by, (tx) => tx.futureItems.beginSubmit());
    expect(await begin(world.as(author))).toEqual({ pending: 0 });
    const first = await create(world.as(author));
    const second = await create(world.as(author), { kind: 'jednani' });
    const returned = await create(world.as(author));
    const approved = await create(world.as(author));
    await create(world.as(author));
    const theirs = await create(world.as(colleague));
    await update(world.as(author), first.item, SUBMIT);
    await update(world.as(author), second.item, SUBMIT);
    await update(world.as(author), returned.item, { ...SUBMIT, state: 'returned' });
    await update(world.as(author), approved.item, { ...SUBMIT, state: 'approved' });
    await update(world.as(colleague), theirs.item, SUBMIT);
    expect(await begin(world.as(author))).toEqual({ pending: 2 });
    expect(await begin(world.as(colleague))).toEqual({ pending: 1 });
    expect(await failure(begin(cli))).toBeInstanceOf(ScopeViolation);
  });

  it('serialises one user’s creates and submit counts from the begin until the transaction ends', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const colleague = await world.seed.user({ role: 'submitter' });
    const order: string[] = [];
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let begun = () => {};
    const isBegun = new Promise<void>((resolve) => {
      begun = resolve;
    });
    const first = audited(world.as(author), async (tx) => {
      await tx.futureItems.beginCreate(nextRef());
      order.push('first begun');
      begun();
      await held;
      const { item } = await tx.futureItems.create({
        clientRef: nextRef(),
        kind: 'akce',
        content: EMPTY,
      });
      order.push('first created');
      return item;
    });
    await isBegun;
    if (world.pg) {
      // Another author is not held up (the fake runs one transaction at a time).
      const theirs = await world.tx(world.as(colleague), (tx) =>
        tx.futureItems.beginCreate(nextRef()),
      );
      expect(theirs).toEqual({ existing: null, drafts: 0 });
    }
    // A submit count of the same author waits for the create's lock as well.
    const second = world.tx(world.as(author), async (tx) => {
      const begin = await tx.futureItems.beginSubmit();
      order.push('second begun');
      return begin;
    });
    if (world.pg) {
      const pg = world.pg;
      await expect.poll(() => pg.lockWaits(), { timeout: 5_000 }).toBe(1);
    } else {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(order).toEqual(['first begun']);
    release();
    await Promise.all([first, second]);
    expect(order).toEqual(['first begun', 'first created', 'second begun']);
  });

  it('does not hold an item create behind a point lock of the same user', async () => {
    // Points and future items are capped on their own: two locks, so neither waits for the other.
    // Only PostgreSQL has locks to tell apart; the fake runs one transaction at a time.
    if (!world.pg) return;
    const author = await world.seed.user({ role: 'submitter' });
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let begun = () => {};
    const isBegun = new Promise<void>((resolve) => {
      begun = resolve;
    });
    const first = world.tx(world.as(author), async (tx) => {
      await tx.points.beginCreate(nextRef());
      begun();
      await held;
    });
    await isBegun;
    const begin = await world.tx(world.as(author), (tx) => tx.futureItems.beginCreate(nextRef()));
    expect(begin).toEqual({ existing: null, drafts: 0 });
    release();
    await first;
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

  it('writes the report state and leaves the rest of the item alone', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const { item } = await create(world.as(author), { content: FULL });
    world.clock.advance(60_000);
    const written = await update(world.as(author), item, { reportState: 'written' });
    expect(written).toEqual({
      ...item,
      reportState: 'written',
      version: 2,
      updatedAt: world.clock.now(),
    });
    expect(await read(world.as(author), (tx) => tx.futureItems.get(item.id))).toEqual(written);
  });

  it('clears an optional field when the content says null', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const { item } = await create(world.as(author), { content: FULL });
    const cleared = await update(world.as(author), item, {
      content: {
        ...FULL,
        endDate: null,
        timeTo: null,
        place: null,
        organizer: null,
        organizerRole: null,
      },
    });
    expect(cleared.content).toMatchObject({ endDate: null, timeTo: null, place: null });
    expect(cleared.content.organizer).toBeNull();
    expect(cleared.content.organizerRole).toBeNull();
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

  it('continues after a cursor: the rows after that one in the list order, none twice', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const as = world.as(author);
    const first = await create(as);
    world.clock.advance(60_000);
    const [second, third] = [await create(as), await create(as)];
    world.clock.advance(60_000);
    const fourth = await create(as);
    const order = await read(as, (tx) => tx.futureItems.list(10));
    expect(order[0]!.id).toBe(fourth.item.id);
    const rest = order.slice(1).map((i) => i.id);
    expect(new Set(rest)).toEqual(new Set([first.item.id, second.item.id, third.item.id]));
    for (let at = 0; at < order.length; at++) {
      const after = await read(as, (tx) => tx.futureItems.list(10, order[at]));
      expect(after.map((i) => i.id)).toEqual(order.slice(at + 1).map((i) => i.id));
    }
    expect(await read(as, (tx) => tx.futureItems.list(1, order[1]))).toHaveLength(1);
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
      ['future_items_lengths', { ...EMPTY, title: 'x'.repeat(201) }, {}],
      ['future_items_lengths', { ...EMPTY, place: 'x'.repeat(121) }, {}],
    ])('%s', async (constraint, content, over) => {
      const author = await world.seed.user({ role: 'submitter' });
      const refused = create(world.as(author), { content, ...over });
      expect(await failure(refused)).toEqual(new DatabaseFailure(`db.constraint.${constraint}`));
      expect(await read(cli, (tx) => tx.futureItems.list(10))).toEqual([]);
    });

    it('future_items_report_akce: a report state on a jednání', async () => {
      const author = await world.seed.user({ role: 'submitter' });
      const { item } = await create(world.as(author), { kind: 'jednani', content: FULL });
      const refused = update(world.as(author), item, { reportState: 'written' });
      expect(await failure(refused)).toEqual(
        new DatabaseFailure('db.constraint.future_items_report_akce'),
      );
      expect(await read(cli, (tx) => tx.futureItems.get(item.id))).toEqual(item);
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

describe('FutureItemRepo scope', () => {
  /** Items of one author in every standing that matters, made through the port. */
  const items = async (author: UserRecord) => {
    const as = world.as(author);
    const made = async (kind: NewFutureItem['kind'], ...patches: FutureItemPatch[]) => {
      let { item } = await create(as, { kind, content: FULL });
      for (const patch of patches) item = await update(as, item, patch);
      return item;
    };
    const handedIn = SUBMIT;
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
   * reads is not theirs to lock or move through `loadForWrite` and `update`. The reviewers'
   * decisions have a path of their own (`loadForDecision`, `decide`, below).
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

describe('FutureItemRepo decision path', () => {
  const handedIn = (author: UserRecord, over: Partial<NewFutureItem> = {}) => {
    const as = world.as(author);
    return create(as, over).then(({ item }) => update(as, item, SUBMIT));
  };
  const lock = (by: Principal, id: string) =>
    world.tx(by, (tx) => tx.futureItems.loadForDecision(id));
  const decide = (
    by: Principal,
    item: FutureItemRecord,
    state: FutureItemRecord['state'],
    version = item.version,
  ) => audited(by, (tx) => tx.futureItems.decide(item.id, version, state));

  it('lets a reviewer or the headmaster lock a handed-in item and move its state, nothing else', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    for (const role of ['reviewer', 'headmaster'] as const) {
      const item = await handedIn(author);
      const by = world.as(await world.seed.user({ role }));
      expect(await lock(by, item.id), role).toEqual(item);
      world.clock.advance(60_000);
      const approved = await decide(by, item, 'approved');
      expect(approved, role).toEqual({
        ...item,
        state: 'approved',
        version: item.version + 1,
        updatedAt: world.clock.now(),
      });
      expect(await read(world.as(author), (tx) => tx.futureItems.get(item.id)), role).toEqual(
        approved,
      );
    }
  });

  it('keeps the hand-in time when an item is returned, so reviewers still see it', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const item = await handedIn(author);
    const reviewer = world.as(await world.seed.user({ role: 'reviewer' }));
    const returned = await decide(reviewer, item, 'returned');
    expect(returned.submittedAt).toEqual(item.submittedAt);
    expect(await lock(reviewer, item.id)).toEqual(returned);
  });

  it('does not find a draft, a retracted item or a colleague’s item outside the reviewer’s scope', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const draft = (await create(world.as(author))).item;
    const retracted = await update(world.as(author), await handedIn(author), {
      state: 'draft',
      submittedAt: null,
    });
    for (const role of ['reviewer', 'headmaster'] as const) {
      const by = world.as(await world.seed.user({ role }));
      for (const item of [draft, retracted]) {
        expect(await lock(by, item.id), role).toBeNull();
        expect(await failure(decide(by, item, 'approved')), role).toBeInstanceOf(StaleVersion);
      }
    }
  });

  it('gives a teacher or a student only their own items, an approved akce of a colleague included', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const approved = await update(world.as(author), await handedIn(author), { state: 'approved' });
    for (const seed of [{ role: 'submitter' }, { role: 'submitter', isStudent: true }] as const) {
      const reader = world.as(await world.seed.user(seed));
      expect(await lock(reader, approved.id)).toBeNull();
      expect(await failure(decide(reader, approved, 'cancelled'))).toBeInstanceOf(StaleVersion);
    }
    const own = await lock(world.as(author), approved.id);
    expect(own).toEqual(approved);
    const cancelled = await decide(world.as(author), approved, 'cancelled');
    expect(cancelled.state).toBe('cancelled');
  });

  it('refuses a stale version and an unknown item with StaleVersion, writing nothing', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const item = await handedIn(author);
    const reviewer = world.as(await world.seed.user({ role: 'reviewer' }));
    expect(await failure(decide(reviewer, item, 'approved', item.version + 1))).toBeInstanceOf(
      StaleVersion,
    );
    expect(await failure(decide(reviewer, { ...item, id: UNKNOWN_ID }, 'approved'))).toBeInstanceOf(
      StaleVersion,
    );
    expect(await read(cli, (tx) => tx.futureItems.get(item.id))).toEqual(item);
  });

  it('refuses the second of two decisions made on the version the first one moved', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const item = await handedIn(author);
    const reviewer = world.as(await world.seed.user({ role: 'reviewer' }));
    const second = world.as(await world.seed.user({ role: 'headmaster' }));
    const first = await audited(reviewer, async (tx) => {
      const locked = await tx.futureItems.loadForDecision(item.id);
      return tx.futureItems.decide(item.id, locked!.version, 'returned');
    });
    const late = await failure(decide(second, item, 'approved'));
    expect(late).toBeInstanceOf(StaleVersion);
    expect(await read(cli, (tx) => tx.futureItems.get(item.id))).toEqual(first);
  });

  describe('a cancel request (ADR 0062)', () => {
    const approvedOf = async (author: UserRecord) =>
      update(world.as(author), await handedIn(author), { state: 'approved' });
    const mark = (by: Principal, item: FutureItemRecord, at: Date | null, version = item.version) =>
      audited(by, (tx) => tx.futureItems.markCancelRequest(item.id, version, at));

    it('lets the author mark it and a reviewer clear it, the version rising each time, nothing else moving', async () => {
      const author = await world.seed.user({ role: 'submitter' });
      const approved = await approvedOf(author);
      expect(approved.cancelRequestedAt).toBeNull();
      world.clock.advance(60_000);
      const at = world.clock.now();
      const asked = await mark(world.as(author), approved, at);
      expect(asked).toEqual({
        ...approved,
        cancelRequestedAt: at,
        version: approved.version + 1,
        updatedAt: at,
      });
      expect(await read(cli, (tx) => tx.futureItems.get(approved.id))).toEqual(asked);
      const reviewer = world.as(await world.seed.user({ role: 'reviewer' }));
      expect(await lock(reviewer, approved.id)).toEqual(asked);
      world.clock.advance(60_000);
      const cleared = await mark(reviewer, asked, null);
      expect(cleared).toEqual({
        ...asked,
        cancelRequestedAt: null,
        version: asked.version + 1,
        updatedAt: world.clock.now(),
      });
    });

    it('refuses a stale version, an unknown item and a colleague outside the scope with StaleVersion', async () => {
      const author = await world.seed.user({ role: 'submitter' });
      const approved = await approvedOf(author);
      const at = world.clock.now();
      const colleague = world.as(await world.seed.user({ role: 'submitter' }));
      // One at a time: a promise made before the loop awaits it could reject unhandled.
      for (const refused of [
        () => mark(world.as(author), approved, at, approved.version + 1),
        () => mark(world.as(author), { ...approved, id: UNKNOWN_ID }, at),
        () => mark(colleague, approved, at),
      ]) {
        expect(await failure(refused())).toBeInstanceOf(StaleVersion);
      }
      expect(await read(cli, (tx) => tx.futureItems.get(approved.id))).toEqual(approved);
    });

    it('future_items_cancel_request: only an approved item holds one', async () => {
      const author = await world.seed.user({ role: 'submitter' });
      const submitted = await handedIn(author);
      const refused = await failure(mark(world.as(author), submitted, world.clock.now()));
      expect(refused).toEqual(new DatabaseFailure('db.constraint.future_items_cancel_request'));
    });

    it('is cleared by any move of the state, by a decision or by the author', async () => {
      const author = await world.seed.user({ role: 'submitter' });
      const reviewer = world.as(await world.seed.user({ role: 'reviewer' }));
      const asked = async () => mark(world.as(author), await approvedOf(author), world.clock.now());
      for (const state of ['cancelled', 'returned', 'rejected'] as const) {
        expect((await decide(reviewer, await asked(), state)).cancelRequestedAt, state).toBeNull();
      }
      const revised = await update(world.as(author), await asked(), { state: 'submitted' });
      expect(revised.cancelRequestedAt).toBeNull();
      // A write that leaves the state alone keeps the request.
      const kept = await update(world.as(author), await asked(), { reportState: 'written' });
      expect(kept.cancelRequestedAt).not.toBeNull();
    });
  });

  it('refuses loadForDecision in a read transaction', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const item = await handedIn(author);
    const refused = await failure(
      read(world.as(author), (tx) => tx.futureItems.loadForDecision(item.id)),
    );
    expect(refused).toEqual(new DatabaseFailure('25006'));
  });
});

describe('FutureItemRepo report prompts (what the worker reads, migration 0022)', () => {
  /** As the worker reads at run time: autoporada_worker in the pg world, with its column grants only. */
  const asWorker = <T>(work: (tx: Tx) => Promise<T>) =>
    world.workerDb.transaction(
      { principal: system('job:future.report-prompt'), now: world.clock.now(), requestId: 'test' },
      { mode: 'read' },
      work,
    );
  const WINDOW = { from: calDate(2026, 11, 1), to: calDate(2026, 11, 20) };

  /** An approved akce of `author`, its content over FULL, then more patches. */
  const akce = (author: UserRecord, content: Partial<FutureContent>, ...more: FutureItemPatch[]) =>
    approved('akce', author, content, ...more);
  /** An approved item of the kind, as `akce`. */
  const approved = async (
    kind: NewFutureItem['kind'],
    author: UserRecord,
    content: Partial<FutureContent>,
    ...more: FutureItemPatch[]
  ) => {
    const as = world.as(author);
    const { item } = await create(as, { kind, content: { ...FULL, ...content } });
    let current = await update(as, item, {
      ...SUBMIT,
      content: { ...FULL, ...content },
      state: 'approved',
    });
    for (const patch of more) current = await update(as, current, patch);
    return current;
  };
  const ids = (rows: readonly { id: string }[]) => rows.map((row) => row.id).sort();

  it('lists the approved akce that have no report, with their last day', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const ended = await akce(author, {
      startDate: calDate(2026, 11, 5),
      endDate: calDate(2026, 11, 7),
    });
    const oneDay = await akce(author, { startDate: calDate(2026, 11, 9), endDate: null });
    const rows = await asWorker((tx) => tx.futureItems.reportPromptDue(WINDOW));
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.id === ended.id)).toEqual({
      id: ended.id,
      authorId: author.id,
      lastDay: calDate(2026, 11, 7),
    });
    expect(rows.find((row) => row.id === oneDay.id)?.lastDay).toEqual(calDate(2026, 11, 9));
  });

  it('keeps the window’s both ends and leaves out a last day outside it', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const day = (d: number) => ({ startDate: calDate(2026, 11, d), endDate: null });
    const first = await akce(author, day(1));
    const last = await akce(author, day(20));
    await akce(author, { startDate: calDate(2026, 10, 31), endDate: null });
    await akce(author, day(21));
    // still running: its last day, not its start, is what counts
    await akce(author, { startDate: calDate(2026, 11, 18), endDate: calDate(2026, 11, 22) });
    const rows = await asWorker((tx) => tx.futureItems.reportPromptDue(WINDOW));
    expect(ids(rows)).toEqual(ids([first, last]));
  });

  it('leaves out what is not an approved akce with no report written', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const day = { startDate: calDate(2026, 11, 5), endDate: null };
    const wanted = await akce(author, day);
    await approved('jednani', author, day);
    await akce(author, day, { state: 'cancelled' });
    await akce(author, day, { reportState: 'written' });
    const { item } = await create(world.as(author), { content: { ...FULL, ...day } });
    await update(world.as(author), item, { ...SUBMIT, content: { ...FULL, ...day } });
    expect(ids(await asWorker((tx) => tx.futureItems.reportPromptDue(WINDOW)))).toEqual([
      wanted.id,
    ]);
  });

  it('refuses a user: only the system reads the prompts', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const refused = read(world.as(author), (tx) => tx.futureItems.reportPromptDue(WINDOW));
    expect(await failure(refused)).toBeInstanceOf(ScopeViolation);
  });

  it('reads the author and the standing of an akce, and nothing it holds', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const item = await akce(author, {});
    expect(await asWorker((tx) => tx.futureItems.mailFacts(item.id))).toEqual({
      id: item.id,
      authorId: author.id,
      state: 'approved',
      reportState: 'none',
    });
    await update(world.as(author), item, { reportState: 'written' });
    expect(await asWorker((tx) => tx.futureItems.mailFacts(item.id))).toMatchObject({
      reportState: 'written',
    });
  });

  it('gives null for an unknown item and refuses a user', async () => {
    expect(await asWorker((tx) => tx.futureItems.mailFacts(UNKNOWN_ID))).toBeNull();
    const author = await world.seed.user({ role: 'submitter' });
    const { item } = await create(world.as(author));
    const refused = read(world.as(author), (tx) => tx.futureItems.mailFacts(item.id));
    expect(await failure(refused)).toBeInstanceOf(ScopeViolation);
  });

  it('lists the reports owed in a window, not one written nor a jednání, to the worker only (ADR 0046, 0048)', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const day = (d: number) => ({ startDate: calDate(2026, 11, d), endDate: null });
    const first = await akce(author, day(1));
    const prompted = await akce(author, day(20), { reportState: 'prompted' });
    await akce(author, { startDate: calDate(2026, 10, 31), endDate: null });
    await akce(author, day(21));
    await akce(author, day(5), { reportState: 'written' });
    await approved('jednani', author, day(7));
    const rows = await asWorker((tx) => tx.futureItems.reportsOwed(WINDOW));
    expect(ids(rows)).toEqual([first.id, prompted.id].sort());
    expect(rows.find((row) => row.id === first.id)).toMatchObject({
      authorId: author.id,
      lastDay: calDate(2026, 11, 1),
    });
    const refused = read(world.as(author), (tx) => tx.futureItems.reportsOwed(WINDOW));
    expect(await failure(refused)).toBeInstanceOf(ScopeViolation);
  });

  it('reads an akce ending and its report, gives null for a jednání or an unknown item (ADR 0048)', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const day = { startDate: calDate(2026, 11, 5), endDate: null };
    const item = await akce(author, day, { reportState: 'prompted' });
    expect(await asWorker((tx) => tx.futureItems.reportEnding(item.id))).toEqual({
      id: item.id,
      authorId: author.id,
      state: 'approved',
      reportState: 'prompted',
      lastDay: calDate(2026, 11, 5),
      timeTo: FULL.timeTo,
    });
    const meeting = await approved('jednani', author, day);
    expect(await asWorker((tx) => tx.futureItems.reportEnding(meeting.id))).toBeNull();
    expect(await asWorker((tx) => tx.futureItems.reportEnding(UNKNOWN_ID))).toBeNull();
    const refused = read(world.as(author), (tx) => tx.futureItems.reportEnding(item.id));
    expect(await failure(refused)).toBeInstanceOf(ScopeViolation);
  });
});

describe('FutureItemRepo countSubmittedSince (what the reviewer digest reads, migration 0024)', () => {
  const asWorker = <T>(work: (tx: Tx) => Promise<T>) =>
    world.workerDb.transaction(
      { principal: system('job:reviewer.digest'), now: world.clock.now(), requestId: 'test' },
      { mode: 'read' },
      work,
    );
  const SINCE = new Date('2026-10-19T12:00:00Z');
  const count = (notBy: string) =>
    asWorker((tx) => tx.futureItems.countSubmittedSince({ since: SINCE, notBy }));

  /** An item of `author` in `state`, handed in at `at`. */
  async function handedIn(author: UserRecord, state: FutureItemPatch['state'], at: string) {
    const { item } = await create(world.as(author), { content: FULL });
    await update(world.as(author), item, { ...SUBMIT, state, submittedAt: new Date(at) });
  }

  it('counts the items waiting for review that were handed in after the instant, except the reader’s own', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const reviewer = await world.seed.user({ role: 'reviewer' });
    await handedIn(author, 'submitted', '2026-10-19T12:00:01Z');
    await handedIn(author, 'submitted', '2026-10-19T12:00:00Z');
    await handedIn(reviewer, 'submitted', '2026-10-19T18:00:00Z');
    expect(await count(reviewer.id)).toBe(1);
    expect(await count(author.id)).toBe(1);
  });

  it('leaves out the items that are not waiting', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const reviewer = await world.seed.user({ role: 'reviewer' });
    for (const state of ['approved', 'returned', 'rejected'] as const) {
      await handedIn(author, state, '2026-10-19T18:00:00Z');
    }
    await create(world.as(author), { content: FULL });
    expect(await count(reviewer.id)).toBe(0);
  });

  it('refuses a user', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const refused = read(world.as(author), (tx) =>
      tx.futureItems.countSubmittedSince({ since: SINCE, notBy: author.id }),
    );
    expect(await failure(refused)).toBeInstanceOf(ScopeViolation);
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
