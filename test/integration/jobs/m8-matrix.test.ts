/**
 * The M8b cron jobs across the three autumn and spring weeks whose Sunday is the day the clocks
 * change (the deadline, Saturday 20.00 Prague, falls the evening before), with a worker down for three hours, a skipped issue and a frozen
 * deadline. Every case checks the exact set of ledger keys the run enqueued, never a count. The
 * expected instants are written out in UTC on purpose: they are the oracle for the zone rules.
 */
import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { JOB_HANDLERS } from '@/application/jobs';
import { system, type UserRecord, type WorkerDeps } from '@/application/ports';
import { saveFuture } from '@/application/use-cases';
import { schoolYear } from '@/domain/cs';
import type { IssueStatus } from '@/domain/review';
import { calDate, toIsoDate, type CalDate } from '@/domain/time';

import { futureFixtures, readyAkce } from '../../support/future';
import { pointFixtures } from '../../support/points';
import { setupWorld } from '../../support/world';
import { unusedConverter } from '../../support/fake-converter';

const world = setupWorld();
const points = pointFixtures(world);
const akce = futureFixtures(world);

const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const SLOW = 60_000;

interface Week {
  readonly name: string;
  readonly monday: CalDate;
  /** The Sunday after the deadline, the day the clocks change. */
  readonly sunday: string;
  /** Soft slot Thursday 13.00, hard slot Saturday 12.00, deadline Saturday 20.00, all Prague. */
  readonly soft: string;
  readonly hard: string;
  readonly deadline: string;
  /** Sunday 07.00 and 15.00 Prague (the digest slots) and the midnight that ends the Sunday. */
  readonly morning: string;
  readonly afternoon: string;
  readonly midnight: string;
  /** A deadline frozen on Friday 16.00 Prague, with the slots that follow from it. */
  readonly frozen: { readonly deadline: string; readonly soft: string; readonly hard: string };
}

const WEEKS: readonly Week[] = [
  {
    name: 'autumn 2026, the clocks go back',
    monday: calDate(2026, 10, 26),
    sunday: '2026-10-25',
    soft: '2026-10-22T11:00:00Z',
    hard: '2026-10-24T10:00:00Z',
    deadline: '2026-10-24T18:00:00Z',
    morning: '2026-10-25T06:00:00Z',
    afternoon: '2026-10-25T14:00:00Z',
    midnight: '2026-10-25T23:00:00Z',
    frozen: {
      deadline: '2026-10-23T14:00:00Z',
      soft: '2026-10-21T11:00:00Z',
      hard: '2026-10-23T10:00:00Z',
    },
  },
  {
    name: 'spring 2027, the clocks go forward',
    monday: calDate(2027, 3, 29),
    sunday: '2027-03-28',
    soft: '2027-03-25T12:00:00Z',
    hard: '2027-03-27T11:00:00Z',
    deadline: '2027-03-27T19:00:00Z',
    morning: '2027-03-28T05:00:00Z',
    afternoon: '2027-03-28T13:00:00Z',
    midnight: '2027-03-28T22:00:00Z',
    frozen: {
      deadline: '2027-03-26T15:00:00Z',
      soft: '2027-03-24T12:00:00Z',
      hard: '2027-03-26T11:00:00Z',
    },
  },
  {
    name: 'autumn 2027, the clocks go back',
    monday: calDate(2027, 11, 1),
    sunday: '2027-10-31',
    soft: '2027-10-28T11:00:00Z',
    hard: '2027-10-30T10:00:00Z',
    deadline: '2027-10-30T18:00:00Z',
    morning: '2027-10-31T06:00:00Z',
    afternoon: '2027-10-31T14:00:00Z',
    midnight: '2027-10-31T23:00:00Z',
    frozen: {
      deadline: '2027-10-29T14:00:00Z',
      soft: '2027-10-27T11:00:00Z',
      hard: '2027-10-29T10:00:00Z',
    },
  },
];

type Name =
  'reminders.deadline' | 'headmaster.summary' | 'reviewer.digest' | 'future.report-prompt';

/** The worker's side: autoporada_worker. None of these jobs sends mail itself. */
const deps = (): WorkerDeps => ({
  db: world.workerDb,
  clock: world.clock,
  appOrigin: 'https://autoporada.test',
  converter: unusedConverter,
  mail: { send: () => Promise.reject(new Error('a producer run sends no mail')) },
});
function run(name: Name, at: Date | string) {
  world.clock.set(new Date(at));
  const input = { id: randomUUID(), data: {}, attempt: 1, dedupeKey: null, redriven: false };
  return JOB_HANDLERS[name](deps(), input);
}

/** Every `step` from `from` to `to`, as instants. */
const grid = (from: Date | string, to: Date | string, step = 15 * MIN) => {
  const start = new Date(from).getTime();
  const count = Math.floor((new Date(to).getTime() - start) / step) + 1;
  return Array.from({ length: count }, (_, i) => new Date(start + i * step));
};
const plus = (instant: string, ms: number) => new Date(new Date(instant).getTime() + ms);
const iso = (instant: string) => new Date(instant).toISOString();
const shiftDay = (day: string, days: number) =>
  new Date(new Date(`${day}T00:00:00Z`).getTime() + days * DAY).toISOString().slice(0, 10);

async function queued() {
  const jobs = await world.inspect.jobs();
  return jobs.map(({ options }) => ({ key: options.dedupeKey!, startAfter: options.startAfter }));
}
const keys = async () => (await queued()).map((q) => q.key).sort();
const sorted = (list: readonly string[]) => [...list].sort();

/** Runs each instant in turn and notes when a key first appeared. */
async function firstSeen(name: Name, instants: readonly Date[]) {
  const seen: Record<string, string> = {};
  for (const instant of instants) {
    await run(name, instant);
    for (const key of await keys()) seen[key] ??= instant.toISOString();
  }
  return seen;
}

const issueAt = (monday: CalDate, deadlineAt: Date, status: IssueStatus = 'open') =>
  world.tx(system('test.seed'), async (tx) => {
    const { issue } = await tx.issues.ensure({
      monday,
      meetingDate: monday,
      schoolYear: schoolYear(monday),
      deadlineAt,
    });
    if (status !== 'open') await tx.issues.setStatus(issue.id, issue.version, status);
  });

const submitter = (over: Parameters<typeof world.seed.user>[0] = {}) =>
  world.seed.user({ role: 'submitter', ...over });
const headmaster = () => world.seed.user({ role: 'headmaster', email: 'reditel@ssps.cz' });
const reviewer = () => world.seed.user({ role: 'reviewer', email: 'kontrola@ssps.cz' });

/**
 * Staff who handed in a point (soft), a draft and a student's draft (hard), and a returned point
 * for the week's Monday (soft and hard), all worked on three days before the soft slot.
 */
async function reminderPeople(week: Week) {
  world.clock.set(plus(week.soft, -3 * DAY));
  const [handedIn, drafter, student, returned] = [
    await submitter(),
    await submitter(),
    await submitter({ isStudent: true }),
    await submitter(),
  ];
  await points.moveTo(handedIn, await points.start(handedIn, 'pokyn'), 'submitted');
  await points.start(drafter, 'pokyn');
  await points.start(student, 'pokyn');
  await points.moveTo(returned, await points.start(returned, 'pokyn'), 'returned', week.monday);
  return { handedIn, drafter, student, returned };
}
const mondayKey = (week: Week) => toIsoDate(week.monday);
const soft = (week: Week, user: UserRecord) => `reminder.soft:${mondayKey(week)}:${user.id}`;
const hard = (week: Week, user: UserRecord) => `reminder.hard:${mondayKey(week)}:${user.id}`;
const summary = (week: Week, user: UserRecord) =>
  `headmaster.summary:${user.id}:${mondayKey(week)}`;

describe.each(WEEKS)('deadline reminders, $name', (week) => {
  it(
    'sends each reminder once, from its own slot and with a start inside the half hour after it',
    async () => {
      const { handedIn, drafter, student, returned } = await reminderPeople(week);
      const seen = await firstSeen('reminders.deadline', [
        ...grid(plus(week.soft, -30 * MIN), plus(week.soft, 6 * HOUR + 30 * MIN)),
        ...grid(plus(week.hard, -30 * MIN), plus(week.deadline, 30 * MIN)),
      ]);
      expect(seen).toEqual({
        [soft(week, handedIn)]: iso(week.soft),
        [soft(week, returned)]: iso(week.soft),
        [hard(week, drafter)]: iso(week.hard),
        [hard(week, student)]: iso(week.hard),
        [hard(week, returned)]: iso(week.hard),
      });
      for (const { key, startAfter } of await queued()) {
        const slot = new Date(key.startsWith('reminder.soft') ? week.soft : week.hard).getTime();
        expect(startAfter!.getTime() - slot).toBeGreaterThanOrEqual(0);
        expect(startAfter!.getTime() - slot).toBeLessThan(30 * MIN);
      }
    },
    SLOW,
  );

  it('catches up after three hours down: the first tick back reminds once, a later one adds nothing', async () => {
    const { handedIn, drafter, student, returned } = await reminderPeople(week);
    await run('reminders.deadline', plus(week.soft, -15 * MIN));
    expect(await keys()).toEqual([]);
    // Down from the soft slot for three hours: the tick back finds the slot still open.
    await run('reminders.deadline', plus(week.soft, 2 * HOUR + 45 * MIN));
    expect(await keys()).toEqual(sorted([soft(week, handedIn), soft(week, returned)]));
    await run('reminders.deadline', plus(week.soft, 3 * HOUR));
    await run('reminders.deadline', plus(week.hard, 2 * HOUR + 45 * MIN));
    await run('reminders.deadline', plus(week.hard, 3 * HOUR));
    expect(await keys()).toEqual(
      sorted([
        soft(week, handedIn),
        soft(week, returned),
        hard(week, drafter),
        hard(week, student),
        hard(week, returned),
      ]),
    );
  });

  it('follows a frozen deadline, and a window the worker sleeps through is not made up', async () => {
    const { handedIn, drafter, student, returned } = await reminderPeople(week);
    await issueAt(week.monday, new Date(week.frozen.deadline));
    // The rule's hard slot comes after the frozen deadline: that week is closed, the next not open.
    await run('reminders.deadline', week.hard);
    expect(await keys()).toEqual([]);
    await run('reminders.deadline', week.frozen.soft);
    expect(await keys()).toEqual(sorted([soft(week, handedIn), soft(week, returned)]));
    // The hard window is the four hours before the frozen deadline; down for three, back 14.45.
    await run('reminders.deadline', plus(week.frozen.hard, 2 * HOUR + 45 * MIN));
    await run('reminders.deadline', plus(week.frozen.deadline, 15 * MIN));
    expect(await keys()).toEqual(
      sorted([
        soft(week, handedIn),
        soft(week, returned),
        hard(week, drafter),
        hard(week, student),
        hard(week, returned),
      ]),
    );
  });

  it('is not made up when the whole window falls inside the downtime', async () => {
    await reminderPeople(week);
    // A frozen deadline two hours after the hard slot: three hours down covers all of it.
    await issueAt(week.monday, plus(week.frozen.hard, 2 * HOUR));
    await run('reminders.deadline', plus(week.frozen.hard, -15 * MIN));
    await run('reminders.deadline', plus(week.frozen.hard, 2 * HOUR + 45 * MIN));
    expect(await queued()).toEqual([]);
  });

  it('reminds nobody, and sends no summary, for a skipped Monday', async () => {
    await reminderPeople(week);
    await headmaster();
    await issueAt(week.monday, new Date(week.deadline), 'skipped');
    for (const at of [week.soft, week.hard, plus(week.deadline, 10 * MIN)]) {
      await run('reminders.deadline', at);
      await run('headmaster.summary', at);
    }
    expect(await queued()).toEqual([]);
  });
});

describe.each(WEEKS)('headmaster summary, $name', (week) => {
  it(
    'is enqueued once, five minutes after the deadline, and not again until the window closes',
    async () => {
      const head = await headmaster();
      await issueAt(week.monday, new Date(week.deadline));
      const seen = await firstSeen(
        'headmaster.summary',
        grid(plus(week.deadline, -10 * MIN), plus(week.deadline, 2 * HOUR + 10 * MIN), 5 * MIN),
      );
      expect(seen).toEqual({ [summary(week, head)]: plus(week.deadline, 5 * MIN).toISOString() });
    },
    SLOW,
  );

  it('goes out when the worker returns inside the window after three hours down, and not after it', async () => {
    const head = await headmaster();
    await issueAt(week.monday, new Date(week.deadline));
    await run('headmaster.summary', plus(week.deadline, -65 * MIN));
    await run('headmaster.summary', plus(week.deadline, 2 * HOUR));
    await run('headmaster.summary', plus(week.deadline, 2 * HOUR + 25 * MIN));
    expect(await queued()).toEqual([]);
    await run('headmaster.summary', plus(week.deadline, 115 * MIN));
    expect(await keys()).toEqual([summary(week, head)]);
  });

  it('follows a frozen deadline', async () => {
    const head = await headmaster();
    await issueAt(week.monday, new Date(week.frozen.deadline));
    await run('headmaster.summary', plus(week.frozen.deadline, 4 * MIN));
    await run('headmaster.summary', plus(week.deadline, 10 * MIN));
    expect(await queued()).toEqual([]);
    await run('headmaster.summary', plus(week.frozen.deadline, 5 * MIN));
    expect(await keys()).toEqual([summary(week, head)]);
  });
});

describe.each(WEEKS)('reviewer digest, $name', (week) => {
  const digest = (user: UserRecord, day: string, slot: '07' | '15') =>
    `reviewer.digest:${user.id}:${day}:${slot}`;

  /** A reviewer and the headmaster, and a point handed in an hour before `at`. */
  async function newsBefore(at: string) {
    const readers = [await reviewer(), await headmaster()];
    const author = await submitter();
    world.clock.set(plus(at, -HOUR));
    await points.moveTo(author, await points.start(author, 'pokyn'), 'submitted');
    return readers;
  }

  it('files the Sunday’s two runs under 07 and 15, whatever offset Prague has that day', async () => {
    const readers = await newsBefore(week.morning);
    await run('reviewer.digest', week.morning);
    expect(await keys()).toEqual(sorted(readers.map((u) => digest(u, week.sunday, '07'))));
    await run('reviewer.digest', week.afternoon);
    expect(await keys()).toEqual(
      sorted(readers.flatMap((u) => [digest(u, week.sunday, '07'), digest(u, week.sunday, '15')])),
    );
  });

  it('files a run after three hours down under the slot it belongs to by the Prague clock', async () => {
    const readers = await newsBefore(week.morning);
    await run('reviewer.digest', plus(week.morning, 3 * HOUR));
    expect(await keys()).toEqual(sorted(readers.map((u) => digest(u, week.sunday, '07'))));
  });

  it('turns the Prague day at midnight, not at the UTC midnight', async () => {
    const readers = await newsBefore(week.midnight);
    await run('reviewer.digest', plus(week.midnight, -1));
    await run('reviewer.digest', week.midnight);
    expect(await keys()).toEqual(
      sorted(
        readers.flatMap((u) => [
          digest(u, week.sunday, '15'),
          digest(u, shiftDay(week.sunday, 1), '07'),
        ]),
      ),
    );
  });
});

describe.each(WEEKS)('report prompt, $name', (week) => {
  /** An approved akce that ended on `day` and expects a report. */
  async function ended(author: UserRecord, day: string) {
    const id = await akce.start(author, 'akce');
    const content = readyAkce({ startDate: day, endDate: null });
    const saved = await world.run(saveFuture, world.as(author), {
      id,
      expectedVersion: 1,
      content,
    });
    if (!saved.ok) throw new Error(`save refused: ${saved.error.code}`);
    await akce.moveTo(author, id, 'approved');
    return id;
  }
  const prompt = (id: string, stage: 1 | 2) => `report.prompt:${id}:${stage}`;

  /** Akce that ended 21 days before the Sunday, 7 days before it and on it: each changes stage at the Monday midnight. */
  async function threeAkce() {
    const author = await submitter();
    world.clock.set(plus(`${week.sunday}T00:00:00Z`, -30 * DAY));
    const old = await ended(author, shiftDay(week.sunday, -21));
    const mid = await ended(author, shiftDay(week.sunday, -7));
    const fresh = await ended(author, week.sunday);
    return { old, mid, fresh };
  }

  it('moves each akce to its next stage at the Prague midnight after the clocks changed', async () => {
    const { old, mid, fresh } = await threeAkce();
    await run('future.report-prompt', plus(week.midnight, -1));
    expect(await keys()).toEqual(sorted([prompt(mid, 1), prompt(old, 2)]));
    await run('future.report-prompt', week.midnight);
    expect(await keys()).toEqual(
      sorted([prompt(mid, 1), prompt(old, 2), prompt(mid, 2), prompt(fresh, 1)]),
    );
  });

  it('sends the same keys when the 08.00 run is three hours late, and nothing on its second run', async () => {
    const { mid, fresh } = await threeAkce();
    await run('future.report-prompt', plus(week.midnight, 11 * HOUR));
    await run('future.report-prompt', plus(week.midnight, 12 * HOUR));
    expect(await keys()).toEqual(sorted([prompt(mid, 2), prompt(fresh, 1)]));
  });
});
