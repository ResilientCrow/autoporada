/** The deadline reminders (design section 13, ADR 0046): which slot, which recipients, which key, how staggered. */
import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

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
import { lateReportFixtures } from '../../../test/support/late-reports';
import { pointFixtures } from '../../../test/support/points';
import { setupWorld } from '../../../test/support/world';
import { JOB_HANDLERS } from './index';
import { unusedConverter } from '../../../test/support/fake-converter';

const world = setupWorld();
const points = pointFixtures(world);
const akce = futureFixtures(world);
const late = lateReportFixtures(world);

/** Monday 26 October 2026: deadline Saturday 24 October 20.00 (18.00Z, the night before the clocks go back). */
const MONDAY = calDate(2026, 10, 26);
const KEY_DAY = toIsoDate(MONDAY);
/** Soft slot Thursday 13.00 Prague (11.00Z); hard slot Saturday 12.00 Prague (10.00Z), both before the deadline. */
const SOFT = new Date('2026-10-22T11:00:00Z');
const HARD = new Date('2026-10-24T10:00:00Z');
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
  converter: unusedConverter,
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

/** The author handed in a point at `when`: that alone asks for no reminder. */
async function handedIn(author: UserRecord, when = new Date('2026-10-12T08:00:00Z')) {
  world.clock.set(when);
  await points.moveTo(author, await points.start(author, 'pokyn'), 'submitted');
}

/**
 * An approved akce of the author's that expects a report, last day `day` (ISO), ending at `timeTo`
 * (20.00 without one). Monday 19 October is the porada before 26 October, so an akce from that
 * day on reports to 26 October.
 */
async function owed(author: UserRecord, day = '2026-10-20', timeTo: string | null = '14:00') {
  world.clock.set(new Date('2026-10-01T08:00:00Z'));
  return late.akce(author, { day, timeTo });
}

/** The author started the akce's report and left it in `state`. */
async function reported(author: UserRecord, akceId: string, state: PointRecord['state']) {
  world.clock.set(new Date('2026-10-21T08:00:00Z'));
  const pointId = await late.report(author, { day: '2026-10-20', timeTo: '14:00' }, state, MONDAY);
  const handed = state !== 'draft' && state !== 'returned';
  await late.patchAkce(author, akceId, {
    reportPointId: pointId,
    ...(handed && { reportState: 'written' as const }),
  });
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

/** An issue row as it was frozen, for a deadline other than the rule's. */
const frozen = (
  monday: CalDate,
  deadlineAt: Date,
  status: 'open' | 'skipped' = 'open',
  meetingDate = monday,
) =>
  world.tx(system('test.seed'), async (tx) => {
    const { issue } = await tx.issues.ensure({
      monday,
      meetingDate,
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
  it('asks the author of an akce whose report is owed from the slot on, with ids only and a start inside the half hour', async () => {
    const user = await submitter();
    await owed(user);
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
    await owed(user);
    await runAt(SOFT);
    const first = await queued();
    await runAt(new Date(SOFT.getTime() + 3 * HOUR));
    // The key is per Monday and person, so the later run adds nothing and moves nothing.
    expect(await queued()).toEqual(first);
    expect(first).toHaveLength(1);
  });

  it('spreads recipients, each at a fixed offset of their own', async () => {
    const users = await Promise.all(Array.from({ length: 6 }, () => submitter()));
    for (const user of users) await owed(user);
    await runAt(SOFT);
    const offsets = (await queued()).map((q) => q.startAfter!.getTime() - SOFT.getTime());
    expect(offsets).toHaveLength(6);
    expect(new Set(offsets).size).toBeGreaterThan(1);
  });

  it('stops six hours after the slot', async () => {
    const user = await submitter();
    await owed(user);
    expect(await runAt(new Date(SOFT.getTime() + 6 * HOUR))).toEqual({
      kind: 'done',
      code: 'none',
    });
    expect(await queued()).toEqual([]);
  });

  it('asks whoever owes a report not handed in, a student too, and nobody for having handed something in', async () => {
    const [notStarted, draft, returned, student, submitted, approved, onlyPoints, blocked] = [
      await submitter(),
      await submitter(),
      await submitter(),
      await submitter({ isStudent: true }),
      await submitter(),
      await submitter(),
      await submitter(),
      await submitter(),
    ];
    await owed(notStarted);
    await reported(draft, await owed(draft), 'draft');
    await reported(returned, await owed(returned), 'returned');
    await owed(student);
    await reported(submitted, await owed(submitted), 'submitted');
    await reported(approved, await owed(approved), 'approved');
    await handedIn(onlyPoints);
    await owed(blocked);
    await afterwards(blocked, { status: 'blocked' });
    await runAt(SOFT);
    expect(await keys()).toEqual(
      [soft(notStarted), soft(draft), soft(returned), soft(student)].sort(),
    );
  });

  it('asks only for akce over by the slot that report to this porada: from the meeting day of the one before', async () => {
    const [before, meetingDay, endsAtSlot, endsAfterSlot, tomorrow] = [
      await submitter(),
      await submitter(),
      await submitter(),
      await submitter(),
      await submitter(),
    ];
    await owed(before, '2026-10-18', null); // reported to 19 October
    await owed(meetingDay, '2026-10-19', '10:00'); // the day of the porada before: too late for it
    await owed(endsAtSlot, '2026-10-22', '13:00');
    await owed(endsAfterSlot, '2026-10-22', '13:15');
    await owed(tomorrow, '2026-10-23', '10:00');
    await runAt(SOFT);
    expect(await keys()).toEqual([soft(meetingDay), soft(endsAtSlot)].sort());
  });

  it('counts from the meeting day the porada before really has', async () => {
    const [moved, beforeMove] = [await submitter(), await submitter()];
    // 19 October held on Wednesday 21st: an akce on the 20th went to it, one on the 21st did not.
    await frozen(
      calDate(2026, 10, 19),
      new Date('2026-10-18T18:00:00Z'),
      'open',
      calDate(2026, 10, 21),
    );
    await owed(beforeMove, '2026-10-20');
    await owed(moved, '2026-10-21', '15:00');
    await runAt(SOFT);
    expect(await keys()).toEqual([soft(moved)]);
  });

  it('steps over a skipped porada before to the one held before it', async () => {
    const [afterSkip, beforeSkip] = [await submitter(), await submitter()];
    await frozen(calDate(2026, 10, 19), new Date('2026-10-17T18:00:00Z'), 'skipped');
    await owed(afterSkip, '2026-10-12');
    await owed(beforeSkip, '2026-10-11');
    await runAt(SOFT);
    expect(await keys()).toEqual([soft(afterSkip)]);
  });

  it('leaves out an akce not approved, one that expects no report and one whose report was declined', async () => {
    const [waiting, noReport, declined] = [await submitter(), await submitter(), await submitter()];
    world.clock.set(new Date('2026-10-01T08:00:00Z'));
    const id = await akce.start(waiting);
    await akce.moveTo(waiting, id, 'submitted');
    await late.akce(noReport, { day: '2026-10-20', timeTo: null }, { expectsReport: false });
    await late.patchAkce(declined, await owed(declined), { reportState: 'declined' });
    await runAt(SOFT);
    expect(await keys()).toEqual([]);
  });

  it('asks nobody when the ledger holds the key already', async () => {
    const user = await submitter();
    await owed(user);
    world.clock.set(SOFT);
    await inLedger(user, soft(user), 'reminder.soft');
    expect(await runAt(SOFT)).toEqual({ kind: 'done', code: 'none' });
    expect(await queued()).toEqual([]);
  });
});

describe('the hard reminder (the deadline day, 12.00 Prague)', () => {
  it('asks authors of a recent draft or a returned point for this Monday, students included', async () => {
    const [drafter, returned, student] = [
      await submitter(),
      await submitter(),
      await submitter({ isStudent: true }),
    ];
    await pointAt(drafter, 'draft', '2026-10-20T08:00:00Z');
    await pointAt(returned, 'returned', '2026-10-20T08:00:00Z');
    await pointAt(student, 'draft', '2026-10-20T08:00:00Z');
    expect(await runAt(new Date(HARD.getTime() - 1))).toEqual({ kind: 'done', code: 'none' });
    expect(await runAt(HARD)).toEqual({ kind: 'done', code: 'reminded' });
    expect(await keys()).toEqual([hard(drafter), hard(returned), hard(student)].sort());
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
    await pointAt(stale, 'draft', '2026-09-26T09:59:59Z');
    await pointAt(fresh, 'draft', '2026-09-26T10:00:00Z');
    await pointAt(later, 'returned', '2026-10-20T08:00:00Z', calDate(2026, 11, 2));
    await pointAt(submitted, 'submitted', '2026-10-20T08:00:00Z');
    await pointAt(approved, 'approved', '2026-10-20T08:00:00Z');
    await pointAt(blocked, 'draft', '2026-10-20T08:00:00Z');
    await afterwards(blocked, { status: 'blocked' });
    await runAt(HARD);
    expect(await keys()).toEqual([hard(fresh)]);
  });

  it('keeps the author’s soft and hard reminders apart: a draft and an owed report get both on their own days', async () => {
    const user = await submitter();
    await pointAt(user, 'draft', '2026-10-20T08:00:00Z');
    await runAt(SOFT);
    expect(await keys()).toEqual([]);
    await owed(user);
    await runAt(SOFT);
    expect(await keys()).toEqual([soft(user)]);
    await runAt(HARD);
    expect(await keys()).toEqual([hard(user), soft(user)].sort());
  });
});

describe('the hard reminder leaves late reports alone (ADR 0035)', () => {
  // Monday 26 October closes on Saturday 24th at 20.00 (18.00Z). An event on Sunday the 25th, the
  // night the clocks go back, ending at 21.00 closes at 23.00 that day: that report has its own mails.
  it('asks the author of a plain draft, not of a draft about a late event, returned or not', async () => {
    const [plain, lateDraft, lateReturned, earlyReport, meetingDay] = [
      await submitter(),
      await submitter(),
      await submitter(),
      await submitter(),
      await submitter(),
    ];
    world.clock.set(new Date('2026-10-20T08:00:00Z'));
    await pointAt(plain, 'draft', '2026-10-20T08:00:00Z');
    await late.report(lateDraft, { day: '2026-10-25', timeTo: '21:00' }, 'draft', MONDAY);
    await late.report(lateReturned, { day: '2026-10-25', timeTo: '21:00' }, 'returned', MONDAY);
    // an event that ended before the deadline, and one on the meeting day, are not late
    await late.report(earlyReport, { day: '2026-10-23', timeTo: '15:00' }, 'draft', MONDAY);
    await late.report(meetingDay, { day: '2026-10-26', timeTo: null }, 'draft', MONDAY);
    await runAt(HARD);
    expect(await keys()).toEqual([hard(plain), hard(earlyReport), hard(meetingDay)].sort());
  });

  it('asks an author who has a late report and a plain draft, for the plain one', async () => {
    const user = await submitter();
    await late.report(user, { day: '2026-10-25', timeTo: null }, 'draft', MONDAY);
    await runAt(HARD);
    expect(await keys()).toEqual([]);
    await pointAt(user, 'draft', '2026-10-20T08:00:00Z');
    await runAt(HARD);
    expect(await keys()).toEqual([hard(user)]);
  });

  it('judges lateness against the deadline the Monday really has', async () => {
    // a deadline frozen at Sunday 23.30 is after the report's close (23.00): the report is not late
    const user = await submitter();
    await frozen(MONDAY, new Date('2026-10-25T22:30:00Z'));
    await late.report(user, { day: '2026-10-25', timeTo: '21:00' }, 'draft', MONDAY);
    await runAt(new Date('2026-10-25T11:00:00Z')); // 12.00 Prague on the deadline's day
    expect(await keys()).toEqual([hard(user)]);
  });
});

describe('the headmaster’s switches (the reminders setting)', () => {
  const switches = (value: { soft: boolean; hard: boolean }) =>
    world.seed.setting('reminders', value);
  /** One person who gets either kind: they owe an akce's report and have a draft for the Monday. */
  async function both() {
    const user = await submitter();
    await owed(user);
    await pointAt(user, 'draft', '2026-10-20T08:00:00Z');
    return user;
  }

  it('sends both kinds when nothing is stored, and when both are stored on', async () => {
    const user = await both();
    await runAt(HARD);
    await runAt(SOFT);
    expect(await keys()).toEqual([hard(user), soft(user)].sort());
  });

  it('sends no soft mail while the soft switch is off, and still sends the hard one', async () => {
    const user = await both();
    await switches({ soft: false, hard: true });
    expect(await runAt(SOFT)).toEqual({ kind: 'done', code: 'none' });
    expect(await queued()).toEqual([]);
    expect(await runAt(HARD)).toEqual({ kind: 'done', code: 'reminded' });
    expect(await keys()).toEqual([hard(user)]);
  });

  it('sends no hard mail while the hard switch is off, and still sends the soft one', async () => {
    const user = await both();
    await switches({ soft: true, hard: false });
    expect(await runAt(HARD)).toEqual({ kind: 'done', code: 'none' });
    expect(await runAt(SOFT)).toEqual({ kind: 'done', code: 'reminded' });
    expect(await keys()).toEqual([soft(user)]);
  });

  it('sends nothing with both off, and catches up when a switch is turned on inside the slot', async () => {
    const user = await both();
    await switches({ soft: false, hard: false });
    expect(await runAt(SOFT)).toEqual({ kind: 'done', code: 'none' });
    await world.tx(system('test.seed'), (tx) =>
      tx.settings.save('reminders', { soft: true, hard: false }, 1),
    );
    await runAt(new Date(SOFT.getTime() + HOUR));
    expect(await keys()).toEqual([soft(user)]);
  });
});

describe('which Monday, and when nothing is due', () => {
  it('reminds nobody after the deadline, nor for the week after', async () => {
    const user = await submitter();
    await owed(user);
    await pointAt(user, 'draft', '2026-10-20T08:00:00Z');
    expect(await runAt(new Date('2026-10-24T18:00:00Z'))).toEqual({ kind: 'done', code: 'none' });
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

  describe('with a stored deadline rule (3 days before the meeting, 20.00)', () => {
    // Friday 23 October 20.00 Prague for the Monday with no row: the hard slot is that Friday at 12.00.
    const FRIDAY_HARD = new Date('2026-10-23T10:00:00Z');
    const stored = () => world.seed.setting('deadline', { dayOffset: -3, time: '20:00' });

    it('counts the deadline of a Monday with no row by the stored rule', async () => {
      await stored();
      const user = await submitter();
      await pointAt(user, 'draft', '2026-10-20T08:00:00Z');
      await runAt(HARD);
      expect(await queued()).toEqual([]);
      await runAt(FRIDAY_HARD);
      expect(await keys()).toEqual([hard(user)]);
    });

    it('keeps the deadline a stored row was frozen with', async () => {
      await stored();
      const user = await submitter();
      await pointAt(user, 'draft', '2026-10-20T08:00:00Z');
      await frozen(MONDAY, deadline(MONDAY, DEFAULT_DEADLINE));
      await runAt(FRIDAY_HARD);
      expect(await queued()).toEqual([]);
      await runAt(HARD);
      expect(await keys()).toEqual([hard(user)]);
    });
  });

  it('reminds nobody for a skipped Monday', async () => {
    const user = await submitter();
    await pointAt(user, 'draft', '2026-10-20T08:00:00Z');
    await frozen(MONDAY, deadline(MONDAY, DEFAULT_DEADLINE), 'skipped');
    expect(await runAt(HARD)).toEqual({ kind: 'done', code: 'none' });
    expect(await queued()).toEqual([]);
  });

  it('speaks for the Monday after a skipped one at its own slots, not a week early', async () => {
    const user = await submitter();
    await owed(user); // 26 October is skipped, so the report goes to 2 November
    await pointAt(user, 'draft', '2026-10-20T08:00:00Z');
    await frozen(MONDAY, deadline(MONDAY, DEFAULT_DEADLINE), 'skipped');
    const next = (kind: 'soft' | 'hard') => `reminder.${kind}:2026-11-02:${user.id}`;
    // The skipped Monday's own slots are silent, and so is the time before the next one's.
    await runAt(SOFT);
    await runAt(HARD);
    expect(await queued()).toEqual([]);
    // 2 November closes on Saturday 31 October, 20.00 Prague: soft Thursday 13.00, hard Saturday 12.00.
    await runAt(new Date('2026-10-29T12:00:00Z'));
    expect(await keys()).toEqual([next('soft')]);
    await runAt(new Date('2026-10-31T11:00:00Z'));
    expect(await keys()).toEqual([next('hard'), next('soft')].sort());
  });
});
