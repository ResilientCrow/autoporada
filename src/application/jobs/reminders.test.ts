/** The deadline reminders (design section 13, D7 (a)): which slot, which recipients, which key, how staggered. */
import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { setReminders } from '@/application/use-cases';
import {
  system,
  type JobInput,
  type PointRecord,
  type UserRecord,
  type WorkerDeps,
} from '@/application/ports';
import { deadline, DEFAULT_DEADLINE, REMINDER_STAGGER_MS } from '@/domain/calendar';
import { schoolYear } from '@/domain/cs';
import { calDate, toIsoDate, type CalDate } from '@/domain/time';

import { futureFixtures } from '../../../test/support/future';
import { pointFixtures } from '../../../test/support/points';
import { setupWorld } from '../../../test/support/world';
import { JOB_HANDLERS } from './index';

const world = setupWorld();
const points = pointFixtures(world);
const akce = futureFixtures(world);

/** Monday 26 October 2026: deadline Sunday 25 October 18.00 (17.00Z, the night the clocks go back). */
const MONDAY = calDate(2026, 10, 26);
const KEY_DAY = toIsoDate(MONDAY);
/** Soft slot Friday 13.00 Prague (11.00Z); hard slot Sunday 12.00 Prague (11.00Z). */
const SOFT = new Date('2026-10-23T11:00:00Z');
const HARD = new Date('2026-10-25T11:00:00Z');
const HOUR = 3_600_000;

const job = (): JobInput<'reminders.deadline'> => ({
  id: randomUUID(),
  data: {},
  attempt: 1,
  dedupeKey: null,
  redriven: false,
});
/** The worker's side: autoporada_worker in the pg world. A reminder run sends no mail itself. */
const deps = (): WorkerDeps => ({
  db: world.workerDb,
  clock: world.clock,
  appOrigin: 'https://autoporada.test',
  mail: { send: () => Promise.reject(new Error('a reminder run sends no mail')) },
});
const runAt = (instant: Date) => {
  world.clock.set(instant);
  return JOB_HANDLERS['reminders.deadline'](deps(), job());
};

async function queued() {
  const jobs = await world.inspect.jobs();
  return jobs.map(({ name, data, options }) => ({
    name,
    data: data as { template: string; recipientId: string; subjectId: string },
    key: options.dedupeKey,
    startAfter: options.startAfter,
  }));
}
const keys = async () => (await queued()).map((q) => q.key).sort();
const soft = (user: UserRecord) => `reminder.soft:${KEY_DAY}:${user.id}`;
const hard = (user: UserRecord) => `reminder.hard:${KEY_DAY}:${user.id}`;

const submitter = (over: Parameters<typeof world.seed.user>[0] = {}) =>
  world.seed.user({ role: 'submitter', ...over });

/** The author handed in a point at `when`, which makes them an active submitter of that school year. */
async function handedIn(author: UserRecord, when = new Date('2026-10-12T08:00:00Z')) {
  world.clock.set(when);
  await points.moveTo(author, await points.start(author, 'pokyn'), 'submitted');
}

/** A point of the author's left in `state` at `when`; a returned one is first handed in for `earliest`. */
async function pointAt(
  author: UserRecord,
  state: PointRecord['state'],
  when: string,
  earliest = MONDAY,
) {
  world.clock.set(new Date(when));
  const id = await points.start(author, 'pokyn');
  if (state !== 'draft') await points.moveTo(author, id, state, earliest);
  return id;
}

/** Changes the user's access after they have worked: a blocked or pending user cannot start a point. */
const afterwards = (user: UserRecord, patch: Parameters<typeof world.seed.user>[0]) =>
  world.tx(system('test.seed'), async (tx) => {
    const current = await tx.users.lock(user.id);
    await tx.users.changeAccess(user.id, current!.version, patch ?? {});
  });

const optOut = async (user: UserRecord) => {
  const result = await world.run(setReminders, world.as(user), { on: false });
  if (!result.ok) throw new Error('opt-out refused');
};

/** An issue row as it was frozen, for a deadline other than the rule's. */
const frozen = (monday: CalDate, deadlineAt: Date, status: 'open' | 'skipped' = 'open') =>
  world.tx(system('test.seed'), async (tx) => {
    const { issue } = await tx.issues.ensure({
      monday,
      meetingDate: monday,
      schoolYear: schoolYear(monday),
      deadlineAt,
    });
    if (status !== 'open') await tx.issues.setStatus(issue.id, issue.version, status);
  });

const inLedger = (
  recipient: UserRecord,
  key: string,
  template: 'reminder.soft' | 'reminder.hard',
) =>
  world.workerDb.transaction(
    { principal: system('job:test'), now: world.clock.now(), requestId: 'seed' },
    { mode: 'write' },
    (tx) =>
      tx.mailLedger.skip({
        dedupeKey: key,
        template,
        recipientId: recipient.id,
        subjectId: recipient.id,
        code: 'skipped.stale',
      }),
  );

describe('the soft reminder (two days before, 13.00 Prague)', () => {
  it('asks an active submitter from the slot on, with ids only and a start inside the half hour', async () => {
    const user = await submitter();
    await handedIn(user);
    expect(await runAt(new Date(SOFT.getTime() - 1))).toEqual({ kind: 'done', code: 'none' });
    expect(await queued()).toEqual([]);

    expect(await runAt(SOFT)).toEqual({ kind: 'done', code: 'reminded' });
    const [only, ...rest] = await queued();
    expect(rest).toEqual([]);
    expect(only).toMatchObject({
      name: 'mail.send',
      data: { template: 'reminder.soft', recipientId: user.id, subjectId: user.id },
      key: soft(user),
    });
    const offset = only!.startAfter!.getTime() - SOFT.getTime();
    expect(offset).toBeGreaterThanOrEqual(0);
    expect(offset).toBeLessThan(REMINDER_STAGGER_MS);
  });

  it('keeps the same start however late in the window the run is', async () => {
    const user = await submitter();
    await handedIn(user);
    await runAt(SOFT);
    const first = await queued();
    await runAt(new Date(SOFT.getTime() + 3 * HOUR));
    // The key is per Monday and person, so the later run adds nothing and moves nothing.
    expect(await queued()).toEqual(first);
    expect(first).toHaveLength(1);
  });

  it('spreads recipients, each at a fixed offset of their own', async () => {
    const users = await Promise.all(Array.from({ length: 6 }, () => submitter()));
    for (const user of users) await handedIn(user);
    await runAt(SOFT);
    const offsets = (await queued()).map((q) => q.startAfter!.getTime() - SOFT.getTime());
    expect(offsets).toHaveLength(6);
    expect(new Set(offsets).size).toBeGreaterThan(1);
  });

  it('stops six hours after the slot', async () => {
    const user = await submitter();
    await handedIn(user);
    expect(await runAt(new Date(SOFT.getTime() + 6 * HOUR))).toEqual({
      kind: 'done',
      code: 'none',
    });
    expect(await queued()).toEqual([]);
  });

  it('asks submitters of a point or of an akce this school year, active, not students, not opted out', async () => {
    const [pointAuthor, akceAuthor, student, optedOut, blocked, lastYear, pending] = [
      await submitter(),
      await submitter(),
      await submitter({ isStudent: true }),
      await submitter(),
      await submitter(),
      await submitter(),
      await submitter(),
    ];
    await handedIn(pointAuthor);
    world.clock.set(new Date('2026-10-12T08:00:00Z'));
    const id = await akce.start(akceAuthor);
    await akce.moveTo(akceAuthor, id, 'submitted');
    for (const user of [student, optedOut, blocked, pending]) await handedIn(user);
    await optOut(optedOut);
    await afterwards(blocked, { status: 'blocked' });
    await afterwards(pending, { role: 'pending' });
    await handedIn(lastYear, new Date('2026-08-20T08:00:00Z'));
    await submitter(); // never handed in anything
    await runAt(SOFT);
    expect(await keys()).toEqual([soft(pointAuthor), soft(akceAuthor)].sort());
  });

  it('asks nobody when the ledger holds the key already', async () => {
    const user = await submitter();
    await handedIn(user);
    world.clock.set(SOFT);
    await inLedger(user, soft(user), 'reminder.soft');
    expect(await runAt(SOFT)).toEqual({ kind: 'done', code: 'none' });
    expect(await queued()).toEqual([]);
  });
});

describe('the hard reminder (the deadline day, 12.00 Prague)', () => {
  it('asks authors of a recent draft or a returned point for this Monday, students and opted-out included', async () => {
    const [drafter, returned, student, optedOut] = [
      await submitter(),
      await submitter(),
      await submitter({ isStudent: true }),
      await submitter(),
    ];
    await pointAt(drafter, 'draft', '2026-10-20T08:00:00Z');
    await pointAt(returned, 'returned', '2026-10-20T08:00:00Z');
    await pointAt(student, 'draft', '2026-10-20T08:00:00Z');
    await pointAt(optedOut, 'draft', '2026-10-20T08:00:00Z');
    await optOut(optedOut);
    expect(await runAt(new Date(HARD.getTime() - 1))).toEqual({ kind: 'done', code: 'none' });
    expect(await runAt(HARD)).toEqual({ kind: 'done', code: 'reminded' });
    expect(await keys()).toEqual(
      [hard(drafter), hard(returned), hard(student), hard(optedOut)].sort(),
    );
    const [one] = await queued();
    expect(one?.data.template).toBe('reminder.hard');
    expect(one?.data.subjectId).toBe(one?.data.recipientId);
  });

  it('leaves out a draft untouched for 28 days, a returned point for a later Monday, and handed-in points', async () => {
    const [stale, fresh, later, submitted, approved, blocked] = [
      await submitter(),
      await submitter(),
      await submitter(),
      await submitter(),
      await submitter(),
      await submitter(),
    ];
    await pointAt(stale, 'draft', '2026-09-27T10:59:59Z');
    await pointAt(fresh, 'draft', '2026-09-27T11:00:00Z');
    await pointAt(later, 'returned', '2026-10-20T08:00:00Z', calDate(2026, 11, 2));
    await pointAt(submitted, 'submitted', '2026-10-20T08:00:00Z');
    await pointAt(approved, 'approved', '2026-10-20T08:00:00Z');
    await pointAt(blocked, 'draft', '2026-10-20T08:00:00Z');
    await afterwards(blocked, { status: 'blocked' });
    await runAt(HARD);
    expect(await keys()).toEqual([hard(fresh)]);
  });

  it('keeps the author’s soft and hard reminders apart: a submitter with a draft gets both on their own days', async () => {
    const user = await submitter();
    await pointAt(user, 'draft', '2026-10-20T08:00:00Z');
    await runAt(SOFT);
    expect(await keys()).toEqual([]);
    await handedIn(user);
    await runAt(SOFT);
    expect(await keys()).toEqual([soft(user)]);
    await runAt(HARD);
    expect(await keys()).toEqual([hard(user), soft(user)].sort());
  });
});

describe('which Monday, and when nothing is due', () => {
  it('reminds nobody after the deadline, nor for the week after', async () => {
    const user = await submitter();
    await pointAt(user, 'draft', '2026-10-20T08:00:00Z');
    await handedIn(user);
    expect(await runAt(new Date('2026-10-25T17:00:00Z'))).toEqual({ kind: 'done', code: 'none' });
    expect(await runAt(new Date('2026-10-26T11:00:00Z'))).toEqual({ kind: 'done', code: 'none' });
    expect(await runAt(new Date('2026-10-28T11:00:00Z'))).toEqual({ kind: 'done', code: 'none' });
    expect(await queued()).toEqual([]);
  });

  it('follows a deadline frozen earlier than the rule’s, and nothing else', async () => {
    const user = await submitter();
    await pointAt(user, 'draft', '2026-10-20T08:00:00Z');
    // Friday 23 October 18.00 Prague: the hard slot is that Friday at 12.00.
    await frozen(MONDAY, new Date('2026-10-23T16:00:00Z'));
    await runAt(HARD);
    expect(await queued()).toEqual([]);
    await runAt(new Date('2026-10-23T10:00:00Z'));
    expect(await keys()).toEqual([hard(user)]);
  });

  it('reminds nobody for a skipped Monday', async () => {
    const user = await submitter();
    await pointAt(user, 'draft', '2026-10-20T08:00:00Z');
    await frozen(MONDAY, deadline(MONDAY, DEFAULT_DEADLINE), 'skipped');
    expect(await runAt(HARD)).toEqual({ kind: 'done', code: 'none' });
    expect(await queued()).toEqual([]);
  });
});
