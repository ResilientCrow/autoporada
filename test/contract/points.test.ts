import { describe, expect, inject, it } from 'vitest';

import {
  DatabaseFailure,
  ScopeViolation,
  StaleVersion,
  system,
  type NewPoint,
  type PointPatch,
  type PointRecord,
  type Principal,
  type Tx,
  type UserRecord,
} from '@/application/ports';
import type { DraftBullet, PointContent } from '@/domain/report';
import { richDocFromText } from '@/domain/richtext';
import { calDate, wallTime } from '@/domain/time';

import { UnauditedWrite } from '../support/world/fake/oracle';
import { erasureRefusedBy, setupWorld } from '../support/world';

const world = setupWorld();
const cli = system('cli:test');

const PEOPLE: DraftBullet = {
  key: 'participants',
  label: 'Účastníci',
  kind: 'people',
  order: 'class-surname',
  people: [
    { salutation: 'pan', givenName: 'Jan', familyName: 'Novák', affiliation: '3.B' },
    { salutation: null, titlesBefore: 'Mgr.', givenName: 'Eva', familyName: 'Malá' },
  ],
};

const EMPTY: PointContent = {
  title: '',
  eventDate: null,
  endDate: null,
  timeFrom: null,
  timeTo: null,
  campus: null,
  place: null,
  opening: '',
  openingEdited: false,
  body: { type: 'doc', content: [] },
  bullets: [],
  statements: [],
};

/** Everything a submitted report needs, and every field filled. */
const FULL: PointContent = {
  title: 'Seminář o vodě',
  eventDate: calDate(2026, 10, 20),
  endDate: calDate(2026, 10, 21),
  timeFrom: wallTime(8, 0),
  timeTo: wallTime(14, 30),
  campus: 'radlice',
  place: 'v učebně S206',
  opening: 'Ve čtvrtek proběhl seminář.',
  openingEdited: true,
  body: richDocFromText('Další odstavec.'),
  bullets: [PEOPLE, { key: 'results', label: 'Výsledky', kind: 'text', text: '1. místo' }],
  statements: [
    {
      speaker: { salutation: 'pan', givenName: 'Jan', familyName: 'Novák' },
      speakerGenitive: 'pana Jana Nováka',
      affiliation: '3.B',
      quote: 'Bylo to zajímavé.',
    },
  ],
};

const SUBMIT: PointPatch = {
  content: FULL,
  state: 'submitted',
  earliestMonday: calDate(2026, 10, 26),
  submittedAt: new Date('2026-10-19T09:00:00Z'),
  handInMonday: calDate(2026, 10, 26),
};

let refs = 0;
const nextRef = () => `00000000-0000-4000-8000-${String(++refs).padStart(12, '0')}`;

/** Runs a point write and names the point in an audit event, as a use case would. */
const audited = (by: Principal, work: (tx: Tx) => Promise<PointRecord>) =>
  world.tx(by, async (tx) => {
    const point = await work(tx);
    await tx.audit.record({ action: 'point.save', target: { type: 'point', id: point.id } });
    return point;
  });

const create = async (by: Principal, over: Partial<NewPoint> = {}) => {
  let inserted = false;
  const point = await audited(by, async (tx) => {
    const result = await tx.points.create({
      clientRef: nextRef(),
      kind: 'report',
      content: EMPTY,
      ...over,
    });
    inserted = result.inserted;
    return result.point;
  });
  return { point, inserted };
};

const update = (by: Principal, point: PointRecord, patch: PointPatch, version = point.version) =>
  audited(by, (tx) => tx.points.update(point.id, version, patch));

const read = <T>(by: Principal, work: (tx: Tx) => Promise<T>) => world.tx(by, work, 'read');
const failure = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: unknown) => error,
  );

describe('PointRepo (port contract)', () => {
  it('creates a draft at version 1 and gives the same row back for the same clientRef', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const clientRef = nextRef();
    // The ref is the author's: a colleague's earlier point with it stays theirs.
    const other = await world.seed.user({ role: 'submitter' });
    const theirs = await create(world.as(other), { clientRef });
    const first = await create(world.as(author), { clientRef, content: FULL });
    expect(first.inserted).toBe(true);
    expect(first.point).toEqual({
      id: first.point.id,
      kind: 'report',
      authorId: author.id,
      state: 'draft',
      content: FULL,
      futureItemId: null,
      earliestMonday: null,
      submittedAt: null,
      handInMonday: null,
      version: 1,
      updatedAt: world.clock.now(),
    });
    world.clock.advance(60_000);
    const again = await create(world.as(author), { clientRef, content: EMPTY });
    expect(again).toEqual({ point: first.point, inserted: false });
    expect(theirs.inserted).toBe(true);
    expect(theirs.point.id).not.toBe(first.point.id);
  });

  it('links a report to the akce it answers and reads the link back', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const akce = await world.tx(world.as(author), async (tx) => {
      const { item } = await tx.futureItems.create({
        clientRef: nextRef(),
        kind: 'akce',
        content: {
          title: 'Výlet',
          startDate: calDate(2026, 11, 10),
          endDate: null,
          timeFrom: null,
          timeTo: null,
          campus: null,
          place: null,
          organizer: null,
          organizerRole: null,
          participants: null,
          note: null,
        },
      });
      await tx.audit.record({
        action: 'future.save',
        target: { type: 'future_item', id: item.id },
      });
      return item;
    });
    const { point } = await create(world.as(author), { futureItemId: akce.id });
    expect(point.futureItemId).toBe(akce.id);
    expect(await read(world.as(author), (tx) => tx.points.get(point.id))).toEqual(point);
    // The link is fixed at the create: a later save keeps it.
    const saved = await update(world.as(author), point, { content: FULL });
    expect(saved.futureItemId).toBe(akce.id);
  });

  it('reads back finance and pokyn points, which have no type', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const { point } = await create(world.as(author), { kind: 'pokyn' });
    expect(await read(world.as(author), (tx) => tx.points.get(point.id))).toEqual(point);
    expect(point).toMatchObject({ kind: 'pokyn', content: EMPTY });
  });

  it('refuses the system as an author', async () => {
    const refused = failure(
      world.tx(cli, (tx) =>
        tx.points.create({ clientRef: nextRef(), kind: 'report', content: EMPTY }),
      ),
    );
    expect(await refused).toBeInstanceOf(ScopeViolation);
  });

  it('begins a create with the user’s own point for the clientRef and their draft count', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const colleague = await world.seed.user({ role: 'submitter' });
    const clientRef = nextRef();
    const mine = await create(world.as(author), { clientRef });
    await create(world.as(author), { kind: 'finance' });
    const returned = await create(world.as(author));
    await update(world.as(author), returned.point, { state: 'returned' });
    const theirRef = nextRef();
    await create(world.as(colleague), { clientRef: theirRef });
    const begin = (by: Principal, ref: string) => world.tx(by, (tx) => tx.points.beginCreate(ref));
    // A returned point is not a draft, and a colleague's drafts are not the user's.
    expect(await begin(world.as(author), clientRef)).toEqual({ existing: mine.point, drafts: 2 });
    expect(await begin(world.as(author), theirRef)).toEqual({ existing: null, drafts: 2 });
    expect(await begin(world.as(colleague), clientRef)).toEqual({ existing: null, drafts: 1 });
    expect(await failure(begin(cli, clientRef))).toBeInstanceOf(ScopeViolation);
  });

  it('serialises one user’s creates from beginCreate until the transaction ends', async () => {
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
      await tx.points.beginCreate(nextRef());
      order.push('first begun');
      begun();
      await held;
      const { point } = await tx.points.create({
        clientRef: nextRef(),
        kind: 'pokyn',
        content: EMPTY,
      });
      order.push('first created');
      return point;
    });
    await isBegun;
    if (world.pg) {
      // Another author is not held up (the fake runs one transaction at a time).
      const theirs = await world.tx(world.as(colleague), (tx) => tx.points.beginCreate(nextRef()));
      expect(theirs).toEqual({ existing: null, drafts: 0 });
    }
    const second = world.tx(world.as(author), async (tx) => {
      const begin = await tx.points.beginCreate(nextRef());
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
    const [, after] = await Promise.all([first, second]);
    expect(order).toEqual(['first begun', 'first created', 'second begun']);
    // The second sees the first's committed draft.
    expect(after).toEqual({ existing: null, drafts: 1 });
  });

  it('begins a submit with how many of the user’s points are submitted, and no other state', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const colleague = await world.seed.user({ role: 'submitter' });
    const begin = (by: Principal) => world.tx(by, (tx) => tx.points.beginSubmit());
    expect(await begin(world.as(author))).toEqual({ pending: 0 });
    const handedIn = await create(world.as(author));
    const other = await create(world.as(author));
    const returned = await create(world.as(author));
    const approved = await create(world.as(author));
    await create(world.as(author));
    await create(world.as(colleague));
    const theirs = await create(world.as(colleague));
    await update(world.as(author), handedIn.point, SUBMIT);
    await update(world.as(author), other.point, SUBMIT);
    await update(world.as(author), returned.point, { ...SUBMIT, state: 'returned' });
    await update(world.as(author), approved.point, { ...SUBMIT, state: 'approved' });
    await update(world.as(colleague), theirs.point, SUBMIT);
    // A returned or approved point is not submitted, a draft neither, and a colleague's is not the user's.
    expect(await begin(world.as(author))).toEqual({ pending: 2 });
    expect(await begin(world.as(colleague))).toEqual({ pending: 1 });
    expect(await failure(begin(cli))).toBeInstanceOf(ScopeViolation);
  });

  it('serialises one user’s submit count with their creates until the transaction ends', async () => {
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
    const { point } = await create(world.as(author));
    const first = audited(world.as(author), async (tx) => {
      await tx.points.beginSubmit();
      order.push('first begun');
      begun();
      await held;
      const updated = await tx.points.update(point.id, point.version, SUBMIT);
      order.push('first submitted');
      return updated;
    });
    await isBegun;
    if (world.pg) {
      // Another author is not held up (the fake runs one transaction at a time).
      const theirs = await world.tx(world.as(colleague), (tx) => tx.points.beginSubmit());
      expect(theirs).toEqual({ pending: 0 });
    }
    // The same lock as a create takes: a create of the author waits, and so does a second submit count.
    const second = world.tx(world.as(author), async (tx) => {
      const begin = await tx.points.beginSubmit();
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
    const [, after] = await Promise.all([first, second]);
    expect(order).toEqual(['first begun', 'first submitted', 'second begun']);
    // The second sees the first's committed submit.
    expect(after).toEqual({ pending: 1 });
  });

  it('holds a create behind a submit count of the same user', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const order: string[] = [];
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let begun = () => {};
    const isBegun = new Promise<void>((resolve) => {
      begun = resolve;
    });
    const first = world.tx(world.as(author), async (tx) => {
      await tx.points.beginSubmit();
      begun();
      await held;
      order.push('first done');
    });
    await isBegun;
    const second = world.tx(world.as(author), async (tx) => {
      await tx.points.beginCreate(nextRef());
      order.push('second begun');
    });
    if (world.pg) {
      const pg = world.pg;
      await expect.poll(() => pg.lockWaits(), { timeout: 5_000 }).toBe(1);
    } else {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(order).toEqual([]);
    release();
    await Promise.all([first, second]);
    expect(order).toEqual(['first done', 'second begun']);
  });

  it('updates against the expected version, raises it by one and keeps unpatched fields', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const { point } = await create(world.as(author));
    world.clock.advance(60_000);
    const saved = await update(world.as(author), point, { content: FULL });
    expect(saved).toEqual({ ...point, content: FULL, version: 2, updatedAt: world.clock.now() });
    const submitted = await update(world.as(author), saved, SUBMIT);
    expect(submitted).toMatchObject({
      state: 'submitted',
      earliestMonday: SUBMIT.earliestMonday,
      submittedAt: SUBMIT.submittedAt,
      version: 3,
    });
    const retracted = await update(world.as(author), submitted, { state: 'draft' });
    expect(retracted).toEqual({ ...submitted, state: 'draft', version: 4 });
    expect(await read(world.as(author), (tx) => tx.points.get(point.id))).toEqual(retracted);
  });

  it('stores the hand-in Monday with the submission, keeps it through a return and an approval, and clears it with a retract', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const { point } = await create(world.as(author));
    const submitted = await update(world.as(author), point, SUBMIT);
    expect(submitted.handInMonday).toEqual(SUBMIT.handInMonday);
    const returned = await update(world.as(author), submitted, { state: 'returned' });
    expect(returned.handInMonday).toEqual(SUBMIT.handInMonday);
    const approved = await update(world.as(author), returned, { state: 'approved' });
    expect(approved.handInMonday).toEqual(SUBMIT.handInMonday);
    const later = { ...SUBMIT, handInMonday: calDate(2026, 11, 2), state: 'submitted' } as const;
    const resubmitted = await update(world.as(author), approved, later);
    expect(resubmitted.handInMonday).toEqual(calDate(2026, 11, 2));
    const retracted = await update(world.as(author), resubmitted, {
      state: 'draft',
      submittedAt: null,
      handInMonday: null,
    });
    expect(retracted).toMatchObject({ submittedAt: null, handInMonday: null });
    expect(await read(world.as(author), (tx) => tx.points.get(point.id))).toEqual(retracted);
  });

  it('refuses a stale version and an unknown point with StaleVersion, writing nothing', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const { point } = await create(world.as(author));
    await update(world.as(author), point, { content: FULL });
    expect(await failure(update(world.as(author), point, { content: EMPTY }))).toBeInstanceOf(
      StaleVersion,
    );
    const unknown = { ...point, id: '00000000-0000-7000-8000-999999999999' };
    expect(await failure(update(world.as(author), unknown, {}))).toBeInstanceOf(StaleVersion);
    const stored = await read(world.as(author), (tx) => tx.points.get(point.id));
    expect(stored).toMatchObject({ content: FULL, version: 2 });
  });

  it('holds the row lock from loadForWrite until the transaction ends', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const { point } = await create(world.as(author));
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
      expect(await tx.points.loadForWrite(point.id)).toEqual(point);
      order.push('first locked');
      locked();
      await held;
      order.push('first done');
    });
    await isLocked;
    const second = world.tx(world.as(author), async (tx) => {
      await tx.points.loadForWrite(point.id);
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
    const { point } = await create(world.as(author));
    const refused = await failure(read(world.as(author), (tx) => tx.points.loadForWrite(point.id)));
    expect(refused).toEqual(new DatabaseFailure('25006'));
  });

  it('lists only the user’s own points, last changed first, up to the limit', async () => {
    const author = await world.seed.user({ role: 'reviewer' });
    const colleague = await world.seed.user({ role: 'submitter' });
    const older = await create(world.as(author), { content: FULL });
    world.clock.advance(60_000);
    const newer = await create(world.as(author));
    const tied = await create(world.as(author));
    const theirs = await create(world.as(colleague), { content: FULL });
    await update(world.as(colleague), theirs.point, SUBMIT);
    // Changed at the same instant: the higher id comes first.
    const [first, second] = [newer.point, tied.point].sort((a, b) => (a.id < b.id ? 1 : -1));
    const mine = await read(world.as(author), (tx) => tx.points.listMine(10));
    expect(mine).toEqual([summary(first!), summary(second!), summary(older.point)]);
    expect(await read(world.as(author), (tx) => tx.points.listMine(1))).toEqual([summary(first!)]);
    expect(await failure(read(cli, (tx) => tx.points.listMine(10)))).toBeInstanceOf(ScopeViolation);
  });

  it('lists the rows strictly after a cursor, in the same order, ties broken by id', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const oldest = await create(world.as(author));
    world.clock.advance(60_000);
    const tied = [(await create(world.as(author))).point, (await create(world.as(author))).point];
    world.clock.advance(60_000);
    const newest = await create(world.as(author));
    await create(world.as(await world.seed.user({ role: 'submitter' })));
    const [high, low] = tied.sort((a, b) => (a.id < b.id ? 1 : -1));
    const after = (point: PointRecord, limit = 10) =>
      read(world.as(author), (tx) => tx.points.listMine(limit, point));

    expect(await after(newest.point)).toEqual([
      summary(high!),
      summary(low!),
      summary(oldest.point),
    ]);
    expect(await after(high!)).toEqual([summary(low!), summary(oldest.point)]);
    expect(await after(high!, 1)).toEqual([summary(low!)]);
    expect(await after(oldest.point)).toEqual([]);
  });

  describe('the return note of listMine', () => {
    const RETURN = { event: 'return', fromState: 'submitted', toState: 'returned' } as const;
    /** A submitted point of the author's, returned with each note in turn, a minute apart. */
    async function returnedWith(author: UserRecord, ...notes: string[]) {
      const { point } = await create(world.as(author), { content: FULL });
      let current = await update(world.as(author), point, SUBMIT);
      for (const note of notes) {
        world.clock.advance(60_000);
        await world.tx(world.as(author), async (tx) => {
          await tx.pointEvents.append({ pointId: point.id, ...RETURN, note });
          await tx.audit.record({ action: 'point.save', target: { type: 'point', id: point.id } });
        });
      }
      current = await update(world.as(author), current, { state: 'returned' });
      return current;
    }
    const noteOf = async (author: UserRecord, id: string) =>
      (await read(world.as(author), (tx) => tx.points.listMine(10))).find((row) => row.id === id)
        ?.returnNote;

    it('is the newest return event’s whole note while the point is returned', async () => {
      const author = await world.seed.user({ role: 'submitter' });
      const point = await returnedWith(author, 'Starší poznámka.', 'Doplňte název.\nA datum.');
      expect(await noteOf(author, point.id)).toBe('Doplňte název.\nA datum.');
    });

    it('is null once the point is no longer returned, and for points that never were', async () => {
      const author = await world.seed.user({ role: 'submitter' });
      const back = await returnedWith(author, 'Doplňte název.');
      const resubmitted = await update(world.as(author), back, { state: 'submitted' });
      const draft = (await create(world.as(author))).point;
      expect(await noteOf(author, resubmitted.id)).toBeNull();
      expect(await noteOf(author, draft.id)).toBeNull();
    });

    it('is never another author’s note', async () => {
      const author = await world.seed.user({ role: 'submitter' });
      const colleague = await world.seed.user({ role: 'submitter' });
      // The colleague's note is the newest return event in the table: only the point it belongs to may show it.
      const mine = await returnedWith(author, 'Moje poznámka.');
      const theirs = await returnedWith(colleague, 'Jen pro kolegu.');
      const rows = await read(world.as(author), (tx) => tx.points.listMine(10));
      expect(rows.map((row) => [row.id, row.returnNote])).toEqual([[mine.id, 'Moje poznámka.']]);
      expect(theirs.id).not.toBe(mine.id);
    });
  });

  it('refuses bullets or statements the contract refuses, before writing', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const twice: PointContent = { ...FULL, bullets: [PEOPLE, PEOPLE] };
    const parse = new DatabaseFailure('db.parse.points');
    expect(await failure(create(world.as(author), { content: twice }))).toEqual(parse);
    const { point } = await create(world.as(author));
    const badQuote = {
      ...FULL.statements[0]!,
      quote: 7,
    } as unknown as PointContent['statements'][0];
    const refused = update(world.as(author), point, {
      content: { ...FULL, statements: [badQuote] },
    });
    expect(await failure(refused)).toEqual(parse);
    expect(await read(world.as(author), (tx) => tx.points.get(point.id))).toEqual(point);
  });

  it('parses the content before it looks for the clientRef, the version or the scope', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const twice: PointContent = { ...FULL, bullets: [PEOPLE, PEOPLE] };
    const parse = new DatabaseFailure('db.parse.points');
    const clientRef = nextRef();
    const { point } = await create(world.as(author), { clientRef });
    const retried = create(world.as(author), { clientRef, content: twice });
    expect(await failure(retried)).toEqual(parse);
    const stale = update(world.as(author), point, { content: twice }, point.version + 1);
    expect(await failure(stale)).toEqual(parse);
    const reviewer = await world.seed.user({ role: 'reviewer' });
    const outOfScope = update(world.as(reviewer), point, { content: twice });
    expect(await failure(outOfScope)).toEqual(parse);
    expect(await read(world.as(author), (tx) => tx.points.get(point.id))).toEqual(point);
  });

  /** Each case makes a draft from `created`, then applies `patches`; the last write is refused. */
  it.each<[string, Partial<NewPoint>, PointPatch[]]>([
    ['points_dates', { content: { ...FULL, endDate: calDate(2026, 10, 19) } }, []],
    ['points_lengths', { content: { ...FULL, title: 'x'.repeat(201) } }, []],
    ['points_monday', {}, [{ ...SUBMIT, earliestMonday: calDate(2026, 10, 27) }]],
    ['points_submitted_complete', {}, [{ ...SUBMIT, content: { ...FULL, opening: '' } }]],
    ['points_earliest_fixed', {}, [SUBMIT, { earliestMonday: calDate(2026, 11, 2) }]],
    ['points_hand_in_monday', {}, [{ ...SUBMIT, handInMonday: calDate(2026, 10, 27) }]],
    // PostgreSQL checks by name: points_hand_in_monday comes before points_monday.
    [
      'points_hand_in_monday',
      {},
      [{ ...SUBMIT, earliestMonday: calDate(2026, 10, 27), handInMonday: calDate(2026, 10, 27) }],
    ],
    ['points_hand_in_set', {}, [{ state: 'draft', submittedAt: SUBMIT.submittedAt }]],
    ['points_hand_in_set', {}, [SUBMIT, { state: 'draft', submittedAt: null }]],
  ])('surfaces %s by its name', async (constraint, created, patches) => {
    const author = await world.seed.user({ role: 'submitter' });
    const write = async () => {
      let { point } = await create(world.as(author), created);
      for (const patch of patches) point = await update(world.as(author), point, patch);
    };
    expect(await failure(write())).toEqual(new DatabaseFailure(`db.constraint.${constraint}`));
  });

  it('keeps a user who wrote a point: erasing them is refused', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const { point } = await create(world.as(author));
    expect(await failure(world.erase.user(author.id))).toMatchObject(
      erasureRefusedBy(world.kind, 'points_author_id_users_id_fk'),
    );
    expect(await read(cli, (tx) => tx.users.get(author.id))).toEqual(author);
    expect(await read(cli, (tx) => tx.points.get(point.id))).toEqual(point);
  });
});

const summary = (p: PointRecord) => ({
  id: p.id,
  kind: p.kind,
  state: p.state,
  title: p.content.title,
  eventDate: p.content.eventDate,
  earliestMonday: p.earliestMonday,
  handInMonday: p.handInMonday,
  returnNote: null,
  version: p.version,
  updatedAt: p.updatedAt,
});

describe('PointRepo scope (own-or-submitted for reviewers)', () => {
  /** A colleague's points in every standing that matters, each made through the port. */
  const colleaguePoints = async (author: UserRecord) => {
    const as = world.as(author);
    const made = async (...patches: PointPatch[]) => {
      let { point } = await create(as);
      for (const patch of patches) point = await update(as, point, patch);
      return point;
    };
    return {
      neverSubmitted: await made(),
      retracted: await made(SUBMIT, { state: 'draft' }),
      withdrawnUnsubmitted: await made({ state: 'withdrawn' }),
      submitted: await made(SUBMIT),
      returned: await made(SUBMIT, { state: 'returned' }),
      approved: await made(SUBMIT, { state: 'approved' }),
      rejected: await made(SUBMIT, { state: 'rejected' }),
      published: await made(SUBMIT, { state: 'approved' }, { state: 'published' }),
      // A returned point the author withdraws keeps its submitted_at: reviewers still see it.
      withdrawnAfterReturn: await made(SUBMIT, { state: 'returned' }, { state: 'withdrawn' }),
    };
  };
  type Standing = keyof Awaited<ReturnType<typeof colleaguePoints>>;
  const VISIBLE: readonly Standing[] = [
    'submitted',
    'returned',
    'approved',
    'rejected',
    'published',
    'withdrawnAfterReturn',
  ];

  const seen = async (by: Principal, points: Record<Standing, PointRecord>) => {
    const visible: string[] = [];
    for (const [standing, point] of Object.entries(points)) {
      const got = await read(by, (tx) => tx.points.get(point.id));
      const locked = await world.tx(by, (tx) => tx.points.loadForWrite(point.id));
      expect(locked, standing).toEqual(got);
      if (got) {
        expect(got, standing).toEqual(point);
        visible.push(standing);
      }
    }
    return visible;
  };

  it('shows a reviewer a colleague’s points only once submitted and not a draft again', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const points = await colleaguePoints(author);
    for (const role of ['reviewer', 'headmaster'] as const) {
      const reviewer = await world.seed.user({ role });
      expect(await seen(world.as(reviewer), points), role).toEqual(VISIBLE);
    }
  });

  it('shows the author all of their own points and the system every point', async () => {
    const author = await world.seed.user({ role: 'reviewer' });
    const points = await colleaguePoints(author);
    expect(await seen(world.as(author), points)).toEqual(Object.keys(points));
    expect(await seen(cli, points)).toEqual(Object.keys(points));
  });

  it('shows a teacher none of a colleague’s points', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const points = await colleaguePoints(author);
    const teacher = await world.seed.user({ role: 'submitter' });
    expect(await seen(world.as(teacher), points)).toEqual([]);
    const own = await create(world.as(teacher));
    expect(await read(world.as(teacher), (tx) => tx.points.get(own.point.id))).toEqual(own.point);
  });

  it('does not let a reviewer write a point outside their scope', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const { neverSubmitted } = await colleaguePoints(author);
    const reviewer = await world.seed.user({ role: 'reviewer' });
    const refused = update(world.as(reviewer), neverSubmitted, { state: 'withdrawn' });
    expect(await failure(refused)).toBeInstanceOf(StaleVersion);
  });
});

describe('PointRepo mailFacts (what the decision mails read again, ADR 0020)', () => {
  /** As the worker reads at send time: autoporada_worker in the pg world, with its column grants only. */
  const asWorker = <T>(work: (tx: Tx) => Promise<T>) =>
    world.workerDb.transaction(
      { principal: system('job:mail.send'), now: world.clock.now(), requestId: 'test' },
      { mode: 'read' },
      work,
    );

  it('reads the author and the state of a point, and nothing it holds', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const { point } = await create(world.as(author), { content: FULL });
    expect(await asWorker((tx) => tx.points.mailFacts(point.id))).toEqual({
      id: point.id,
      authorId: author.id,
      state: 'draft',
    });
    await update(world.as(author), point, SUBMIT);
    expect(await asWorker((tx) => tx.points.mailFacts(point.id))).toMatchObject({
      state: 'submitted',
    });
  });

  it('gives null for an unknown point', async () => {
    const unknown = '00000000-0000-7000-8000-999999999999';
    expect(await asWorker((tx) => tx.points.mailFacts(unknown))).toBeNull();
  });

  it('refuses a user: only the system reads mail facts', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const { point } = await create(world.as(author));
    const refused = read(world.as(author), (tx) => tx.points.mailFacts(point.id));
    expect(await failure(refused)).toBeInstanceOf(ScopeViolation);
  });
});

describe('PointRepo reminders (what the worker reads, migration 0024)', () => {
  /** As the worker reads at run time: autoporada_worker in the pg world, with its column grants only. */
  const asWorker = <T>(work: (tx: Tx) => Promise<T>) =>
    world.workerDb.transaction(
      { principal: system('job:reminders.deadline'), now: world.clock.now(), requestId: 'test' },
      { mode: 'read' },
      work,
    );
  const MONDAY = calDate(2026, 11, 2);
  const SINCE = new Date('2026-10-05T00:00:00Z');
  const DEADLINE = new Date('2026-10-31T19:00:00Z');
  const waiting = () =>
    asWorker((tx) =>
      tx.points.reminderAuthors({
        draftsSince: SINCE,
        monday: MONDAY,
        meetingDate: MONDAY,
        deadlineAt: DEADLINE,
      }),
    );

  /** A point of `author` that stands in `state` with the given first Monday. */
  async function pointIn(author: UserRecord, state: PointPatch['state'], earliest = MONDAY) {
    const { point } = await create(world.as(author), { content: FULL });
    if (state === 'draft') return point;
    return update(world.as(author), point, { ...SUBMIT, state, earliestMonday: earliest });
  }

  it('lists each author of a recent draft or of a returned point that can still go to the Monday, once', async () => {
    const [drafter, returned, both] = [
      await world.seed.user({ role: 'submitter' }),
      await world.seed.user({ role: 'submitter' }),
      await world.seed.user({ role: 'submitter' }),
    ];
    await pointIn(drafter, 'draft');
    await pointIn(returned, 'returned', calDate(2026, 10, 26));
    await pointIn(both, 'draft');
    await pointIn(both, 'draft');
    await pointIn(both, 'returned', MONDAY);
    expect(await waiting()).toEqual([drafter.id, returned.id, both.id].sort());
  });

  it('leaves out stale drafts, returned points for a later Monday and every other state', async () => {
    const [stale, later, submitted, approved] = [
      await world.seed.user({ role: 'submitter' }),
      await world.seed.user({ role: 'submitter' }),
      await world.seed.user({ role: 'submitter' }),
      await world.seed.user({ role: 'submitter' }),
    ];
    world.clock.set(new Date('2026-10-04T10:00:00Z'));
    await pointIn(stale, 'draft');
    world.clock.set(new Date('2026-10-20T10:00:00Z'));
    await pointIn(later, 'returned', calDate(2026, 11, 9));
    await pointIn(submitted, 'submitted');
    await pointIn(approved, 'approved');
    expect(await waiting()).toEqual([]);
  });

  it('refuses a user: only the system reads them', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const refused = read(world.as(author), (tx) =>
      tx.points.reminderAuthors({
        draftsSince: SINCE,
        monday: MONDAY,
        meetingDate: MONDAY,
        deadlineAt: DEADLINE,
      }),
    );
    expect(await failure(refused)).toBeInstanceOf(ScopeViolation);
  });
});

describe('PointRepo countSubmittedSince (what the reviewer digest reads, migration 0024)', () => {
  const asWorker = <T>(work: (tx: Tx) => Promise<T>) =>
    world.workerDb.transaction(
      { principal: system('job:reviewer.digest'), now: world.clock.now(), requestId: 'test' },
      { mode: 'read' },
      work,
    );
  const SINCE = new Date('2026-10-19T12:00:00Z');
  const count = (notBy: string) =>
    asWorker((tx) => tx.points.countSubmittedSince({ since: SINCE, notBy }));

  /** A point of `author` in `state`, handed in at `at`. */
  async function handedIn(author: UserRecord, state: PointPatch['state'], at: string) {
    const { point } = await create(world.as(author), { content: FULL });
    return update(world.as(author), point, { ...SUBMIT, state, submittedAt: new Date(at) });
  }

  it('counts the points waiting for review that were handed in after the instant, not those before or at it', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const other = await world.seed.user({ role: 'submitter' });
    const reader = await world.seed.user({ role: 'reviewer' });
    await handedIn(author, 'submitted', '2026-10-19T12:00:01Z');
    await handedIn(author, 'submitted', '2026-10-19T12:00:00Z');
    await handedIn(other, 'submitted', '2026-10-19T18:00:00Z');
    await handedIn(other, 'submitted', '2026-10-19T11:59:59Z');
    expect(await count(reader.id)).toBe(2);
  });

  it('leaves out the points that are not waiting, whoever decided them', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const reader = await world.seed.user({ role: 'reviewer' });
    for (const state of ['approved', 'returned', 'rejected', 'withdrawn'] as const) {
      await handedIn(author, state, '2026-10-19T18:00:00Z');
    }
    await create(world.as(author), { content: FULL });
    expect(await count(reader.id)).toBe(0);
  });

  it('leaves out the reader’s own points: a reviewer is not told about what they handed in', async () => {
    const reviewer = await world.seed.user({ role: 'reviewer' });
    const author = await world.seed.user({ role: 'submitter' });
    await handedIn(reviewer, 'submitted', '2026-10-19T18:00:00Z');
    await handedIn(author, 'submitted', '2026-10-19T18:00:00Z');
    expect(await count(reviewer.id)).toBe(1);
    expect(await count(author.id)).toBe(1);
  });

  it('refuses a user: only the system reads them', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const refused = read(world.as(author), (tx) =>
      tx.points.countSubmittedSince({ since: SINCE, notBy: author.id }),
    );
    expect(await failure(refused)).toBeInstanceOf(ScopeViolation);
  });
});

describe('PointRepo handedInFor (what the headmaster summary reads, migration 0024)', () => {
  const asWorker = <T>(work: (tx: Tx) => Promise<T>) =>
    world.workerDb.transaction(
      { principal: system('job:headmaster.summary'), now: world.clock.now(), requestId: 'test' },
      { mode: 'read' },
      work,
    );
  const MONDAY = calDate(2026, 11, 2);
  const handedIn = (monday = MONDAY) => asWorker((tx) => tx.points.handedInFor(monday));

  /** A point of `author` in `state`, first handed in for `earliest` at `at`. */
  async function pointIn(
    author: UserRecord,
    state: PointPatch['state'],
    earliest = MONDAY,
    at = '2026-10-30T09:00:00Z',
    handIn = MONDAY,
  ) {
    const { point } = await create(world.as(author), { content: FULL });
    return update(world.as(author), point, {
      ...SUBMIT,
      state,
      earliestMonday: earliest,
      submittedAt: new Date(at),
      handInMonday: handIn,
    });
  }

  it('lists the submitted, approved and returned points with their state, first Monday and hand-in Monday', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    await pointIn(author, 'submitted', MONDAY, '2026-10-30T09:00:00Z');
    await pointIn(
      author,
      'approved',
      calDate(2026, 10, 26),
      '2026-10-22T09:00:00Z',
      calDate(2026, 10, 26),
    );
    await pointIn(author, 'returned', calDate(2026, 10, 26), '2026-10-29T09:00:00Z', MONDAY);
    const rows = await handedIn();
    expect([...rows].sort((a, b) => a.state.localeCompare(b.state))).toEqual([
      {
        state: 'approved',
        earliestMonday: calDate(2026, 10, 26),
        handInMonday: calDate(2026, 10, 26),
      },
      { state: 'returned', earliestMonday: calDate(2026, 10, 26), handInMonday: MONDAY },
      { state: 'submitted', earliestMonday: MONDAY, handInMonday: MONDAY },
    ]);
  });

  it('leaves out a point first handed in for a later Monday, and every other state', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    await pointIn(author, 'submitted', calDate(2026, 11, 9));
    for (const state of ['rejected', 'withdrawn', 'published'] as const) {
      await pointIn(author, state);
    }
    await create(world.as(author), { content: FULL });
    expect(await handedIn()).toEqual([]);
  });

  it('refuses a user: only the system reads them', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const refused = read(world.as(author), (tx) => tx.points.handedInFor(MONDAY));
    expect(await failure(refused)).toBeInstanceOf(ScopeViolation);
  });
});

describe.runIf(inject('world') === 'fake')('point audit coverage in the fake world', () => {
  it('names every created or updated point as a written row', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const unaudited = (work: (tx: Tx) => Promise<unknown>) =>
      failure(world.tx(world.as(author), work));
    const newPoint = { clientRef: nextRef(), kind: 'report', content: EMPTY } as const;
    expect(await unaudited((tx) => tx.points.create(newPoint))).toBeInstanceOf(UnauditedWrite);
    const { point } = await create(world.as(author));
    expect(await unaudited((tx) => tx.points.update(point.id, 1, {}))).toBeInstanceOf(
      UnauditedWrite,
    );
  });
});
