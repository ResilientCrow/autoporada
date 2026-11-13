import { describe, expect, inject, it } from 'vitest';

import {
  DatabaseFailure,
  ScopeViolation,
  system,
  type FutureContent,
  type FutureEventRecord,
  type FutureItemRecord,
  type NewFutureEvent,
  type Principal,
  type UserRecord,
} from '@/application/ports';
import { calDate } from '@/domain/time';

import { UnauditedWrite } from '../support/world/fake/oracle';
import { erasureRefusedBy, setupWorld } from '../support/world';

const world = setupWorld();
const cli = system('cli:test');
const UNKNOWN_ID = '00000000-0000-7000-8000-999999999999';

let refs = 0;
const nextRef = () => `00000000-0000-4000-8000-${String(++refs).padStart(12, '0')}`;

const failure = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: unknown) => error,
  );

const CONTENT: FutureContent = {
  title: 'Výlet do Prahy',
  startDate: calDate(2026, 11, 10),
  endDate: null,
  timeFrom: null,
  timeTo: null,
  campus: null,
  place: null,
  organizer: null,
  participants: null,
  note: null,
};

/** A submitted akce, so a reviewer may see it; or a draft, which only its author and the system see. */
async function makeItem(author: UserRecord, submitted: boolean): Promise<FutureItemRecord> {
  return world.tx(world.as(author), async (tx) => {
    const { item } = await tx.futureItems.create({
      clientRef: nextRef(),
      kind: 'akce',
      content: CONTENT,
    });
    const saved = submitted
      ? await tx.futureItems.update(item.id, item.version, {
          state: 'submitted',
          submittedAt: world.clock.now(),
        })
      : item;
    await tx.audit.record({ action: 'future.save', target: { type: 'future_item', id: saved.id } });
    return saved;
  });
}

const SUBMIT: NewFutureEvent = {
  futureItemId: '',
  event: 'submit',
  fromState: 'draft',
  toState: 'submitted',
};

/** Appends events as `by` would in a use case: with an audit event naming each item. */
const append = (by: Principal, ...events: NewFutureEvent[]) =>
  world.tx(by, async (tx) => {
    const records: FutureEventRecord[] = [];
    for (const event of events) records.push(await tx.futureEvents.append(event));
    for (const id of new Set(events.map((e) => e.futureItemId))) {
      await tx.audit.record({ action: 'future.save', target: { type: 'future_item', id } });
    }
    return records;
  });

const list = (by: Principal, futureItemId: string) =>
  world.tx(by, (tx) => tx.futureEvents.list(futureItemId), 'read');

/** Higher ids first, as PostgreSQL compares uuids. */
const newestFirst = (ids: readonly string[]) => [...ids].sort((a, b) => (a < b ? 1 : -1));

describe('FutureEventRepo (port contract)', () => {
  it('appends an event with the transaction’s user as its actor and the call’s instant', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const item = await makeItem(author, false);
    const [event] = await append(world.as(author), { ...SUBMIT, futureItemId: item.id });
    expect(event).toEqual({
      id: event!.id,
      futureItemId: item.id,
      actorId: author.id,
      event: 'submit',
      fromState: 'draft',
      toState: 'submitted',
      note: null,
      returnParts: null,
      editedFields: null,
      createdAt: world.clock.now(),
    });
    expect(await list(world.as(author), item.id)).toEqual([event]);
  });

  it('gives a system event no actor', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const item = await makeItem(author, true);
    const [event] = await append(cli, { ...SUBMIT, futureItemId: item.id, event: 'cancel' });
    expect(event).toMatchObject({ actorId: null, event: 'cancel' });
    expect(await list(cli, item.id)).toEqual([event]);
  });

  it('accepts five parts on a return, the most the CHECK allows', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const reviewer = await world.seed.user({ role: 'reviewer' });
    const item = await makeItem(author, true);
    const [event] = await append(world.as(reviewer), {
      futureItemId: item.id,
      fromState: 'submitted',
      toState: 'returned',
      event: 'return',
      returnParts: ['title', 'when', 'place', 'who', 'note'],
    });
    expect(event!.returnParts).toHaveLength(5);
  });

  it('keeps the parts of a return, with a note or without one, and none on another event', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const reviewer = await world.seed.user({ role: 'reviewer' });
    const item = await makeItem(author, true);
    const returned = {
      futureItemId: item.id,
      fromState: 'submitted',
      toState: 'returned',
    } as const;
    const [partsOnly, both, noteOnly, submit] = await append(
      world.as(reviewer),
      { ...returned, event: 'return', returnParts: ['who', 'when'] },
      { ...returned, event: 'return', note: 'Doplňte.', returnParts: ['place'] },
      { ...returned, event: 'return', note: 'Doplňte.' },
      { ...SUBMIT, futureItemId: item.id },
    );
    expect(partsOnly).toMatchObject({ note: null, returnParts: ['who', 'when'] });
    expect(both).toMatchObject({ note: 'Doplňte.', returnParts: ['place'] });
    expect(noteOnly!.returnParts).toBeNull();
    expect(submit!.returnParts).toBeNull();
    const listed = await list(world.as(author), item.id);
    expect(listed).toEqual(expect.arrayContaining([partsOnly, both, noteOnly, submit]));
  });

  it('keeps the note and the edited fields of a reviewer’s edit', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const reviewer = await world.seed.user({ role: 'reviewer' });
    const item = await makeItem(author, true);
    const [edit, returned] = await append(
      world.as(reviewer),
      {
        futureItemId: item.id,
        event: 'edit',
        fromState: 'submitted',
        toState: 'submitted',
        editedFields: ['title', 'place'],
      },
      {
        futureItemId: item.id,
        event: 'return',
        fromState: 'submitted',
        toState: 'returned',
        note: 'Doplňte prosím místo.\nDěkuji 💧',
      },
    );
    expect(edit).toMatchObject({ actorId: reviewer.id, editedFields: ['title', 'place'] });
    expect(returned).toMatchObject({
      note: 'Doplňte prosím místo.\nDěkuji 💧',
      editedFields: null,
    });
    expect(await list(world.as(author), item.id)).toEqual(expect.arrayContaining([edit, returned]));
  });

  it('lists an item’s events newest first, ties to the higher id, and no other item’s', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const item = await makeItem(author, false);
    const other = await makeItem(author, false);
    const as = world.as(author);
    const events = { futureItemId: item.id, fromState: 'draft', toState: 'submitted' } as const;
    const [first] = await append(as, { ...events, event: 'submit' });
    world.clock.advance(60_000);
    const [second] = await append(as, { ...events, event: 'retract' });
    world.clock.advance(60_000);
    const tied = await append(
      as,
      { ...events, event: 'submit' },
      { ...events, event: 'withdraw' },
      { ...SUBMIT, futureItemId: other.id },
    );
    const sameInstant = newestFirst([tied[0]!.id, tied[1]!.id]);
    expect((await list(as, item.id)).map((e) => e.id)).toEqual([
      ...sameInstant,
      second!.id,
      first!.id,
    ]);
    expect(await list(as, other.id)).toEqual([tied[2]]);
  });

  it('lists nothing for an item that has no events or does not exist', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const item = await makeItem(author, false);
    expect(await list(world.as(author), item.id)).toEqual([]);
    expect(await list(world.as(author), UNKNOWN_ID)).toEqual([]);
    expect(await list(cli, UNKNOWN_ID)).toEqual([]);
  });

  it('scopes list like the items: a draft’s events are the author’s alone', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const draft = await makeItem(author, false);
    const submitted = await makeItem(author, true);
    await append(world.as(author), { ...SUBMIT, futureItemId: draft.id });
    await append(world.as(author), { ...SUBMIT, futureItemId: submitted.id });
    for (const role of ['reviewer', 'headmaster'] as const) {
      const reviewer = world.as(await world.seed.user({ role }));
      expect(await list(reviewer, draft.id), role).toEqual([]);
      expect(await list(reviewer, submitted.id), role).toHaveLength(1);
    }
    const teacher = world.as(await world.seed.user({ role: 'submitter' }));
    expect(await list(teacher, submitted.id)).toEqual([]);
    expect(await list(world.as(author), draft.id)).toHaveLength(1);
    expect(await list(cli, draft.id)).toHaveLength(1);
  });

  it('keeps the history of an approved akce from a colleague: only its author and the reviewers read it', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const reviewer = await world.seed.user({ role: 'reviewer' });
    const item = await makeItem(author, true);
    await world.tx(cli, async (tx) => {
      await tx.futureItems.update(item.id, item.version, { state: 'approved' });
      await tx.audit.record({
        action: 'future.approved',
        target: { type: 'future_item', id: item.id },
      });
    });
    const [returned] = await append(world.as(reviewer), {
      futureItemId: item.id,
      event: 'return',
      fromState: 'submitted',
      toState: 'returned',
      note: 'Doplňte prosím místo.',
    });
    const colleagues = [
      await world.seed.user({ role: 'submitter' }),
      await world.seed.user({ role: 'submitter', isStudent: true }),
    ];
    for (const colleague of colleagues) {
      // The item itself is theirs to read ...
      const seen = await world.tx(world.as(colleague), (tx) => tx.futureItems.get(item.id), 'read');
      expect(seen?.id).toBe(item.id);
      // ... its history is not, and nor is it theirs to add to.
      expect(await list(world.as(colleague), item.id)).toEqual([]);
      const refused = failure(append(world.as(colleague), { ...SUBMIT, futureItemId: item.id }));
      expect(await refused).toBeInstanceOf(ScopeViolation);
    }
    for (const by of [world.as(author), world.as(reviewer), cli]) {
      expect(await list(by, item.id)).toEqual([returned]);
    }
    expect(await list(world.as(await world.seed.user({ role: 'headmaster' })), item.id)).toEqual([
      returned,
    ]);
  });

  it('refuses an append to an item outside the principal’s scope and writes nothing', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const draft = await makeItem(author, false);
    const submitted = await makeItem(author, true);
    const teacher = world.as(await world.seed.user({ role: 'submitter' }));
    const reviewer = world.as(await world.seed.user({ role: 'reviewer' }));
    const refuse = (by: Principal, futureItemId: string) =>
      failure(append(by, { ...SUBMIT, futureItemId }));
    expect(await refuse(teacher, submitted.id)).toBeInstanceOf(ScopeViolation);
    expect(await refuse(reviewer, draft.id)).toBeInstanceOf(ScopeViolation);
    expect(await refuse(reviewer, UNKNOWN_ID)).toBeInstanceOf(ScopeViolation);
    expect(await list(cli, draft.id)).toEqual([]);
    expect(await list(cli, submitted.id)).toEqual([]);
    await append(reviewer, { ...SUBMIT, futureItemId: submitted.id });
    expect(await list(cli, submitted.id)).toHaveLength(1);
  });

  it('checks the scope before the transaction mode, and refuses a write in a read transaction', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const draft = await makeItem(author, false);
    const reviewer = world.as(await world.seed.user({ role: 'reviewer' }));
    const appendRead = (by: Principal, futureItemId: string) =>
      failure(world.tx(by, (tx) => tx.futureEvents.append({ ...SUBMIT, futureItemId }), 'read'));
    for (const id of [draft.id, UNKNOWN_ID]) {
      expect(await appendRead(reviewer, id)).toBeInstanceOf(ScopeViolation);
    }
    expect(await appendRead(world.as(author), draft.id)).toEqual(new DatabaseFailure('25006'));
  });

  it('counts a note in code points: 2000 are kept, 2001 are refused', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const reviewer = await world.seed.user({ role: 'reviewer' });
    const item = await makeItem(author, true);
    const withNote = (n: number): NewFutureEvent => ({
      futureItemId: item.id,
      event: 'return',
      fromState: 'submitted',
      toState: 'returned',
      note: '💧'.repeat(n),
    });
    const [kept] = await append(world.as(reviewer), withNote(2000));
    expect(kept!.note).toBe('💧'.repeat(2000));
    const refused = await failure(append(world.as(reviewer), withNote(2001)));
    expect(refused).toEqual(new DatabaseFailure('db.constraint.future_events_note'));
    expect(await list(cli, item.id)).toHaveLength(1);
  });

  /** Each case is one event a reviewer may not write, with the CHECK or key that refuses it. */
  describe('surfaces a refused row by its constraint name', () => {
    const base = { fromState: 'submitted', toState: 'returned' } as const;
    it.each<[string, Partial<NewFutureEvent> & Pick<NewFutureEvent, 'event'>]>([
      ['future_events_note', { event: 'submit', note: '' }],
      ['future_events_note_required', { event: 'return' }],
      ['future_events_note_required', { event: 'reject' }],
      // Parts stand in for the note of a return only.
      ['future_events_note_required', { event: 'reject', returnParts: [] }],
      // A refused cancel tells the author why (ADR 0062).
      ['future_events_note_required', { event: 'refuse-cancel' }],
      ['future_events_return_parts', { event: 'reject', note: 'x', returnParts: ['title'] }],
      ['future_events_return_parts', { event: 'submit', returnParts: ['title'] }],
      ['future_events_return_parts', { event: 'return', returnParts: [] }],
      [
        'future_events_return_parts',
        { event: 'return', returnParts: ['a', 'b', 'c', 'd', 'e', 'f'] },
      ],
      // Several at once: PostgreSQL names the CHECK that sorts first.
      ['future_events_note', { event: 'return', note: '' }],
    ])('%s', async (constraint, event) => {
      const author = await world.seed.user({ role: 'submitter' });
      const reviewer = await world.seed.user({ role: 'reviewer' });
      const item = await makeItem(author, true);
      const refused = append(world.as(reviewer), { ...base, futureItemId: item.id, ...event });
      expect(await failure(refused)).toEqual(new DatabaseFailure(`db.constraint.${constraint}`));
      expect(await list(cli, item.id)).toEqual([]);
    });

    it('future_events_future_item_id_future_items_id_fk', async () => {
      // Only the system is unscoped: a user's append to an unknown item is a ScopeViolation.
      const refused = append(cli, { ...SUBMIT, futureItemId: UNKNOWN_ID });
      expect(await failure(refused)).toEqual(
        new DatabaseFailure('db.constraint.future_events_future_item_id_future_items_id_fk'),
      );
    });

    it('future_events_actor_id_users_id_fk', async () => {
      const author = await world.seed.user({ role: 'submitter' });
      const reviewer = await world.seed.user({ role: 'reviewer' });
      const item = await makeItem(author, true);
      const ghost = world.as({ ...reviewer, id: UNKNOWN_ID });
      const refused = append(ghost, { ...SUBMIT, futureItemId: item.id });
      expect(await failure(refused)).toEqual(
        new DatabaseFailure('db.constraint.future_events_actor_id_users_id_fk'),
      );
    });

    it('the CHECKs come before the foreign keys', async () => {
      const author = await world.seed.user({ role: 'submitter' });
      const reviewer = await world.seed.user({ role: 'reviewer' });
      const item = await makeItem(author, true);
      const ghost = world.as({ ...reviewer, id: UNKNOWN_ID });
      const refused = append(ghost, { ...SUBMIT, futureItemId: item.id, note: '' });
      expect(await failure(refused)).toEqual(
        new DatabaseFailure('db.constraint.future_events_note'),
      );
    });
  });

  it('keeps a user who acted on an item: erasing them is refused', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const reviewer = await world.seed.user({ role: 'reviewer' });
    const item = await makeItem(author, true);
    const [event] = await append(world.as(reviewer), {
      futureItemId: item.id,
      event: 'approve',
      fromState: 'submitted',
      toState: 'approved',
    });
    expect(await failure(world.erase.user(reviewer.id))).toMatchObject(
      erasureRefusedBy(world.kind, 'future_events_actor_id_users_id_fk'),
    );
    expect(await world.tx(cli, (tx) => tx.users.get(reviewer.id), 'read')).toEqual(reviewer);
    expect(await list(cli, item.id)).toEqual([event]);
  });

  it('refuses erasing an author who holds both foreign keys: the item and their submit event', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const item = await makeItem(author, false);
    const [event] = await append(world.as(author), { ...SUBMIT, futureItemId: item.id });
    // PostgreSQL fires the checks in the order of their trigger names, and drizzle/0019 adds the
    // event's key before the item's, so that name is the one reported.
    expect(await failure(world.erase.user(author.id))).toMatchObject(
      erasureRefusedBy(world.kind, 'future_events_actor_id_users_id_fk'),
    );
    expect(await world.tx(cli, (tx) => tx.users.get(author.id), 'read')).toEqual(author);
    expect(await list(cli, item.id)).toEqual([event]);
  });
});

describe.runIf(inject('world') === 'fake')('future event audit coverage in the fake world', () => {
  it('names the item of every appended event as a written row', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const item = await makeItem(author, false);
    const unaudited = await failure(
      world.tx(world.as(author), (tx) =>
        tx.futureEvents.append({ ...SUBMIT, futureItemId: item.id }),
      ),
    );
    expect(unaudited).toBeInstanceOf(UnauditedWrite);
    expect(unaudited).toHaveProperty('message', `no audit event names future_item:${item.id}`);
    await append(world.as(author), { ...SUBMIT, futureItemId: item.id });
  });
});
