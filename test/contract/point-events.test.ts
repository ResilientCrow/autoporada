import { beforeEach, describe, expect, inject, it } from 'vitest';

import {
  DatabaseFailure,
  ScopeViolation,
  system,
  type NewPointEvent,
  type PointEventRecord,
  type PointRecord,
  type Principal,
  type Tx,
  type UserRecord,
} from '@/application/ports';
import { richDocFromText } from '@/domain/richtext';
import { calDate, wallTime } from '@/domain/time';

import { UnauditedWrite } from '../support/world/fake/oracle';
import { erasureRefusedBy, setupWorld } from '../support/world';

const world = setupWorld();
const cli = system('cli:test');
const UNKNOWN_ID = '00000000-0000-7000-8000-999999999999';

let typeId = '';
let refs = 0;
const nextRef = () => `00000000-0000-4000-8000-${String(++refs).padStart(12, '0')}`;

beforeEach(async () => {
  typeId = (await world.seed.pointType({ name: 'Seminář', position: 1 })).id;
});

const failure = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: unknown) => error,
  );

/** A submitted report, so a reviewer may see it; or a draft, which only its author and the system see. */
async function makePoint(author: UserRecord, submitted: boolean): Promise<PointRecord> {
  return world.tx(world.as(author), async (tx) => {
    const { point } = await tx.points.create({
      clientRef: nextRef(),
      kind: 'report',
      typeId,
      content: {
        title: 'Seminář o vodě',
        eventDate: calDate(2026, 10, 20),
        endDate: null,
        timeFrom: wallTime(8, 0),
        timeTo: null,
        campus: null,
        place: null,
        opening: 'Ve čtvrtek proběhl seminář.',
        openingEdited: false,
        body: richDocFromText('Text.'),
        bullets: [],
        statements: [],
      },
    });
    const saved = submitted
      ? await tx.points.update(point.id, point.version, {
          state: 'submitted',
          earliestMonday: calDate(2026, 10, 26),
          submittedAt: world.clock.now(),
          handInMonday: calDate(2026, 10, 26),
        })
      : point;
    await tx.audit.record({ action: 'point.save', target: { type: 'point', id: saved.id } });
    return saved;
  });
}

const SUBMIT: NewPointEvent = {
  pointId: '',
  event: 'submit',
  fromState: 'draft',
  toState: 'submitted',
};

/** Appends events as `by` would in a use case: with an audit event naming each point. */
const append = (by: Principal, ...events: NewPointEvent[]) =>
  world.tx(by, async (tx) => {
    const records: PointEventRecord[] = [];
    for (const event of events) records.push(await tx.pointEvents.append(event));
    for (const pointId of new Set(events.map((e) => e.pointId))) {
      await tx.audit.record({ action: 'point.save', target: { type: 'point', id: pointId } });
    }
    return records;
  });

const list = (by: Principal, pointId: string) =>
  world.tx(by, (tx) => tx.pointEvents.list(pointId), 'read');

/** Higher ids first, as PostgreSQL compares uuids. */
const newestFirst = (ids: readonly string[]) => [...ids].sort((a, b) => (a < b ? 1 : -1));

describe('PointEventRepo (port contract)', () => {
  it('appends an event with the transaction’s user as its actor and the call’s instant', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const point = await makePoint(author, false);
    const [event] = await append(world.as(author), { ...SUBMIT, pointId: point.id });
    expect(event).toEqual({
      id: event!.id,
      pointId: point.id,
      actorId: author.id,
      event: 'submit',
      fromState: 'draft',
      toState: 'submitted',
      note: null,
      editedFields: null,
      before: null,
      createdAt: world.clock.now(),
    });
    expect(await list(world.as(author), point.id)).toEqual([event]);
  });

  it('gives a system event no actor', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const point = await makePoint(author, true);
    const [event] = await append(cli, {
      pointId: point.id,
      event: 'publish',
      fromState: 'approved',
      toState: 'published',
    });
    expect(event).toMatchObject({ actorId: null, event: 'publish' });
    expect(await list(cli, point.id)).toEqual([event]);
  });

  it('keeps the note, the edited fields and the previous values of a reviewer’s edit', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const reviewer = await world.seed.user({ role: 'reviewer' });
    const point = await makePoint(author, true);
    const before = { title: 'Seminář „o vodě“ 💧', opening: '', nested: { list: [1, null, 'ž'] } };
    const [edit, returned] = await append(
      world.as(reviewer),
      {
        pointId: point.id,
        event: 'edit',
        fromState: 'submitted',
        toState: 'submitted',
        editedFields: ['title', 'opening'],
        before,
      },
      {
        pointId: point.id,
        event: 'return',
        fromState: 'submitted',
        toState: 'returned',
        note: 'Doplňte prosím datum.\nDěkuji',
      },
    );
    expect(edit).toMatchObject({
      actorId: reviewer.id,
      editedFields: ['title', 'opening'],
      before,
    });
    expect(returned).toMatchObject({ note: 'Doplňte prosím datum.\nDěkuji', before: null });
    expect(await list(world.as(author), point.id)).toEqual(
      expect.arrayContaining([edit, returned]),
    );
  });

  it('lists a point’s events newest first, ties to the higher id, and no other point’s', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const point = await makePoint(author, false);
    const other = await makePoint(author, false);
    const as = world.as(author);
    const events = { pointId: point.id, fromState: 'draft', toState: 'submitted' } as const;
    const [first] = await append(as, { ...events, event: 'submit' });
    world.clock.advance(60_000);
    const [second] = await append(as, { ...events, event: 'retract' });
    world.clock.advance(60_000);
    const tied = await append(
      as,
      { ...events, event: 'submit' },
      { ...events, event: 'withdraw' },
      { pointId: other.id, event: 'submit', fromState: 'draft', toState: 'submitted' },
    );
    const [tiedA, tiedB] = tied;
    const sameInstant = newestFirst([tiedA!.id, tiedB!.id]);
    const listed = await list(as, point.id);
    expect(listed.map((e) => e.id)).toEqual([...sameInstant, second!.id, first!.id]);
    expect(await list(as, other.id)).toEqual([tied[2]]);
  });

  it('lists nothing for a point that has no events or does not exist', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const point = await makePoint(author, false);
    expect(await list(world.as(author), point.id)).toEqual([]);
    expect(await list(world.as(author), UNKNOWN_ID)).toEqual([]);
    expect(await list(cli, UNKNOWN_ID)).toEqual([]);
  });

  it('scopes list like the points: a draft’s events are the author’s alone', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const point = await makePoint(author, false);
    const submitted = await makePoint(author, true);
    await append(world.as(author), { ...SUBMIT, pointId: point.id });
    await append(world.as(author), { ...SUBMIT, pointId: submitted.id });
    const teacher = await world.seed.user({ role: 'submitter' });
    for (const role of ['reviewer', 'headmaster'] as const) {
      const reviewer = world.as(await world.seed.user({ role }));
      expect(await list(reviewer, point.id), role).toEqual([]);
      expect(await list(reviewer, submitted.id), role).toHaveLength(1);
    }
    expect(await list(world.as(teacher), submitted.id)).toEqual([]);
    expect(await list(world.as(author), point.id)).toHaveLength(1);
    expect(await list(cli, point.id)).toHaveLength(1);
  });

  it('refuses an append to a point outside the principal’s scope and writes nothing', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const draft = await makePoint(author, false);
    const submitted = await makePoint(author, true);
    const teacher = world.as(await world.seed.user({ role: 'submitter' }));
    const reviewer = world.as(await world.seed.user({ role: 'reviewer' }));
    const refuse = (by: Principal, pointId: string) => failure(append(by, { ...SUBMIT, pointId }));
    expect(await refuse(teacher, submitted.id)).toBeInstanceOf(ScopeViolation);
    expect(await refuse(reviewer, draft.id)).toBeInstanceOf(ScopeViolation);
    expect(await refuse(reviewer, UNKNOWN_ID)).toBeInstanceOf(ScopeViolation);
    expect(await list(cli, draft.id)).toEqual([]);
    expect(await list(cli, submitted.id)).toEqual([]);
    await append(reviewer, { ...SUBMIT, pointId: submitted.id });
    expect(await list(cli, submitted.id)).toHaveLength(1);
  });

  it('refuses an append in a read transaction', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const point = await makePoint(author, false);
    const refused = world.tx(
      world.as(author),
      (tx) => tx.pointEvents.append({ ...SUBMIT, pointId: point.id }),
      'read',
    );
    expect(await failure(refused)).toEqual(new DatabaseFailure('25006'));
  });

  it('checks the scope before the transaction mode, as the scoped select runs first', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const draft = await makePoint(author, false);
    const reviewer = world.as(await world.seed.user({ role: 'reviewer' }));
    for (const pointId of [draft.id, UNKNOWN_ID]) {
      const refused = world.tx(
        reviewer,
        (tx) => tx.pointEvents.append({ ...SUBMIT, pointId }),
        'read',
      );
      expect(await failure(refused)).toBeInstanceOf(ScopeViolation);
    }
  });

  it('counts a note in code points: 2000 are kept, 2001 are refused', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const reviewer = await world.seed.user({ role: 'reviewer' });
    const point = await makePoint(author, true);
    const note = (n: number) => '💧'.repeat(n);
    const withNote = (text: string): NewPointEvent => ({
      pointId: point.id,
      event: 'return',
      fromState: 'submitted',
      toState: 'returned',
      note: text,
    });
    const [kept] = await append(world.as(reviewer), withNote(note(2000)));
    expect(kept!.note).toBe(note(2000));
    const refused = await failure(append(world.as(reviewer), withNote(note(2001))));
    expect(refused).toEqual(new DatabaseFailure('db.constraint.point_events_note'));
    expect(await list(cli, point.id)).toHaveLength(1);
  });

  /** Each case is one event an author or reviewer may not write, with the CHECK or key that refuses it. */
  describe('surfaces a refused row by its constraint name', () => {
    const base = { fromState: 'submitted', toState: 'returned' } as const;
    it.each<[string, Partial<NewPointEvent> & Pick<NewPointEvent, 'event'>]>([
      ['point_events_note', { event: 'submit', note: '' }],
      ['point_events_note_required', { event: 'return' }],
      ['point_events_note_required', { event: 'reject' }],
      ['point_events_before_edit', { event: 'submit', before: { title: 'x' } }],
      // Several at once: PostgreSQL names the CHECK that sorts first.
      ['point_events_before_edit', { event: 'return', before: { title: 'x' } }],
      ['point_events_note', { event: 'return', note: '' }],
    ])('%s', async (constraint, event) => {
      const author = await world.seed.user({ role: 'submitter' });
      const reviewer = await world.seed.user({ role: 'reviewer' });
      const point = await makePoint(author, true);
      const refused = append(world.as(reviewer), { ...base, pointId: point.id, ...event });
      expect(await failure(refused)).toEqual(new DatabaseFailure(`db.constraint.${constraint}`));
      expect(await list(cli, point.id)).toEqual([]);
    });

    it('point_events_point_id_points_id_fk', async () => {
      // Only the system is unscoped: a user's append to an unknown point is a ScopeViolation.
      const refused = append(cli, { ...SUBMIT, pointId: UNKNOWN_ID });
      expect(await failure(refused)).toEqual(
        new DatabaseFailure('db.constraint.point_events_point_id_points_id_fk'),
      );
    });

    it('point_events_actor_id_users_id_fk', async () => {
      const author = await world.seed.user({ role: 'submitter' });
      const reviewer = await world.seed.user({ role: 'reviewer' });
      const point = await makePoint(author, true);
      const ghost = world.as({ ...reviewer, id: UNKNOWN_ID });
      const refused = append(ghost, { ...SUBMIT, pointId: point.id });
      expect(await failure(refused)).toEqual(
        new DatabaseFailure('db.constraint.point_events_actor_id_users_id_fk'),
      );
    });

    it('the CHECKs come before the foreign keys', async () => {
      const author = await world.seed.user({ role: 'submitter' });
      const reviewer = await world.seed.user({ role: 'reviewer' });
      const point = await makePoint(author, true);
      const ghost = world.as({ ...reviewer, id: UNKNOWN_ID });
      const refused = append(ghost, { ...SUBMIT, pointId: point.id, note: '' });
      expect(await failure(refused)).toEqual(
        new DatabaseFailure('db.constraint.point_events_note'),
      );
    });
  });

  it('keeps a user who acted on a point: erasing them is refused', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const reviewer = await world.seed.user({ role: 'reviewer' });
    const point = await makePoint(author, true);
    const [event] = await append(world.as(reviewer), {
      pointId: point.id,
      event: 'approve',
      fromState: 'submitted',
      toState: 'approved',
    });
    expect(await failure(world.erase.user(reviewer.id))).toMatchObject(
      erasureRefusedBy(world.kind, 'point_events_actor_id_users_id_fk'),
    );
    expect(await world.tx(cli, (tx) => tx.users.get(reviewer.id), 'read')).toEqual(reviewer);
    expect(await list(cli, point.id)).toEqual([event]);
  });

  it('refuses erasing an author who holds both foreign keys: the point and their submit event', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const point = await makePoint(author, false);
    const [event] = await append(world.as(author), { ...SUBMIT, pointId: point.id });
    // The author wrote the point (points_author_id_users_id_fk) and caused its submit event
    // (point_events_actor_id_users_id_fk); both refuse the delete. PostgreSQL fires the checks in
    // the order of their trigger names (RI_ConstraintTrigger_a_<oid>), and drizzle/0015 adds the
    // event's key first, so that name is the one reported (five of five runs, a database per run).
    expect(await failure(world.erase.user(author.id))).toMatchObject(
      erasureRefusedBy(world.kind, 'point_events_actor_id_users_id_fk'),
    );
    expect(await world.tx(cli, (tx) => tx.users.get(author.id), 'read')).toEqual(author);
    expect(await list(cli, point.id)).toEqual([event]);
  });
});

describe('PointEventRepo mailFacts (what the decision mails read again, ADR 0020)', () => {
  /** As the worker reads at send time: autoporada_worker in the pg world, with its column grants only. */
  const asWorker = <T>(work: (tx: Tx) => Promise<T>) =>
    world.workerDb.transaction(
      { principal: system('job:mail.send'), now: world.clock.now(), requestId: 'test' },
      { mode: 'read' },
      work,
    );

  it('reads what an event did to which point, never its note', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const reviewer = await world.seed.user({ role: 'reviewer' });
    const point = await makePoint(author, true);
    const [returned] = await append(world.as(reviewer), {
      pointId: point.id,
      event: 'return',
      fromState: 'submitted',
      toState: 'returned',
      note: 'Doplňte prosím vyjádření.',
    });
    expect(await asWorker((tx) => tx.pointEvents.mailFacts(returned!.id))).toEqual({
      id: returned!.id,
      pointId: point.id,
      event: 'return',
      toState: 'returned',
    });
  });

  it('gives null for an unknown event, and for a point’s id', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const point = await makePoint(author, false);
    await append(world.as(author), { ...SUBMIT, pointId: point.id });
    expect(await asWorker((tx) => tx.pointEvents.mailFacts(UNKNOWN_ID))).toBeNull();
    expect(await asWorker((tx) => tx.pointEvents.mailFacts(point.id))).toBeNull();
  });

  it('refuses a user: only the system reads mail facts', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const point = await makePoint(author, false);
    const [event] = await append(world.as(author), { ...SUBMIT, pointId: point.id });
    const refused = world.tx(world.as(author), (tx) => tx.pointEvents.mailFacts(event!.id), 'read');
    expect(await failure(refused)).toBeInstanceOf(ScopeViolation);
  });
});

describe.runIf(inject('world') === 'fake')('point event audit coverage in the fake world', () => {
  it('names the point of every appended event as a written row', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const point = await makePoint(author, false);
    const unaudited = await failure(
      world.tx(world.as(author), (tx) => tx.pointEvents.append({ ...SUBMIT, pointId: point.id })),
    );
    expect(unaudited).toBeInstanceOf(UnauditedWrite);
    expect(unaudited).toHaveProperty('message', `no audit event names point:${point.id}`);
    await append(world.as(author), { ...SUBMIT, pointId: point.id });
  });
});
