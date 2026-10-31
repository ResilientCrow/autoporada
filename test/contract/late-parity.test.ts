/**
 * The SQL twin of `isLateReport` (`lateFor`, behind `reminderAuthors`) must agree with the
 * domain function (ADR 0035): a draft report is left out of the hard reminder exactly when the
 * domain calls it late. The matrix covers the nights the clocks change (Europe/Prague,
 * 2026-10-25 and 2027-03-28), events with and without an end time and on several days, and
 * deadlines on both sides of the close, of the cap at 00.00 of the meeting day and of the tick.
 */
import { describe, expect, it } from 'vitest';

import { system, type UserRecord } from '@/application/ports';
import {
  isLateReport,
  lateFacts,
  LATE_GRACE_MS,
  eventEnd,
  type PoradaClose,
} from '@/domain/calendar';
import {
  calDate,
  parseIsoDate,
  parseWallTime,
  wallClockToInstant,
  type CalDate,
} from '@/domain/time';

import { lateReportFixtures } from '../support/late-reports';
import { setupWorld } from '../support/world';

const world = setupWorld();
const fixtures = lateReportFixtures(world);

const MINUTE = 60_000;
const SINCE = new Date('2020-01-01T00:00:00Z');

interface Event {
  readonly day: string;
  readonly endDay: string | null;
  readonly timeTo: string | null;
}

/** The end times: none, the small hours, the nonexistent and the repeated hour, the day and the evening. */
const TIMES = [null, '00:00', '00:30', '01:30', '02:30', '03:00', '12:00', '20:00', '23:59'];

/** The meeting date and the days of events around it; the matrix is one block per meeting. */
const BLOCKS: readonly {
  readonly name: string;
  readonly meeting: CalDate;
  readonly days: readonly [string, string | null][];
}[] = [
  {
    name: 'an ordinary week (CET)',
    meeting: calDate(2026, 11, 2),
    days: [
      ['2026-10-31', null],
      ['2026-11-01', null],
      ['2026-10-30', '2026-11-01'],
    ],
  },
  {
    name: 'the night the clocks go back (2026-10-25, 25 hours)',
    meeting: calDate(2026, 10, 26),
    days: [
      ['2026-10-24', null],
      ['2026-10-25', null],
      ['2026-10-24', '2026-10-25'],
    ],
  },
  {
    name: 'the night the clocks go forward (2027-03-28, 23 hours)',
    meeting: calDate(2027, 3, 29),
    days: [
      ['2027-03-27', null],
      ['2027-03-28', null],
      ['2027-03-27', '2027-03-28'],
    ],
  },
  {
    name: 'a porada moved to Wednesday',
    meeting: calDate(2026, 11, 4),
    days: [
      ['2026-11-02', null],
      ['2026-11-03', null],
    ],
  },
  {
    name: 'events on and after the meeting day (never late)',
    meeting: calDate(2026, 11, 2),
    days: [
      ['2026-11-02', null],
      ['2026-11-03', null],
      ['2026-11-01', '2026-11-02'],
    ],
  },
];

const eventsOf = (days: readonly [string, string | null][]): Event[] =>
  days.flatMap(([day, endDay]) => TIMES.map((timeTo) => ({ day, endDay, timeTo })));

/** The deadlines worth trying for an event: around its close, the cap, and the end itself. */
function deadlinesFor(event: Event, meeting: CalDate): Date[] {
  const facts = lateFacts({
    eventDate: parseIsoDate(event.day),
    endDate: event.endDay === null ? null : parseIsoDate(event.endDay),
    timeTo: event.timeTo === null ? null : parseWallTime(event.timeTo),
  })!;
  const close = eventEnd(facts).getTime() + LATE_GRACE_MS;
  const cap = wallClockToInstant(meeting, parseWallTime('0:00')).getTime();
  const end = eventEnd(facts).getTime();
  return [end, close, cap].flatMap((at) => [-MINUTE, 0, MINUTE].map((d) => new Date(at + d)));
}

describe.each(BLOCKS)('late-report parity: $name', ({ meeting, days }) => {
  it('leaves out of the reminder exactly the drafts the domain calls late', async () => {
    const events = eventsOf(days);
    const authors = new Map<string, Event>();
    const users: UserRecord[] = [];
    for (const event of events) {
      const author = await world.seed.user({ role: 'submitter' });
      users.push(author);
      await fixtures.report(author, { day: event.day, endDay: event.endDay, timeTo: event.timeTo });
      authors.set(author.id, event);
    }
    const deadlines = new Map(
      events.flatMap((event) => deadlinesFor(event, meeting)).map((d) => [d.getTime(), d]),
    );

    const disagreements: string[] = [];
    for (const deadlineAt of deadlines.values()) {
      const porada: PoradaClose = { meetingDate: meeting, deadlineAt };
      const waiting = new Set(
        await world.workerDb.transaction(
          { principal: system('job:test'), now: world.clock.now(), requestId: 'parity' },
          { mode: 'read' },
          (tx) =>
            tx.points.reminderAuthors({
              draftsSince: SINCE,
              monday: meeting,
              meetingDate: meeting,
              deadlineAt,
            }),
        ),
      );
      for (const [id, event] of authors) {
        const facts = lateFacts({
          eventDate: parseIsoDate(event.day),
          endDate: event.endDay === null ? null : parseIsoDate(event.endDay),
          timeTo: event.timeTo === null ? null : parseWallTime(event.timeTo),
        })!;
        if (waiting.has(id) === isLateReport(porada, facts)) {
          disagreements.push(
            `${JSON.stringify(event)} deadline ${deadlineAt.toISOString()}: domain late=${isLateReport(porada, facts)}, SQL waiting=${waiting.has(id)}`,
          );
        }
      }
    }
    expect(disagreements).toEqual([]);
  }, 120_000);
});

describe('late-report parity: what has no event date or is not a report', () => {
  const deadlineAt = new Date('2026-10-31T19:00:00Z');
  const waiting = () =>
    world.workerDb.transaction(
      { principal: system('job:test'), now: world.clock.now(), requestId: 'parity' },
      { mode: 'read' },
      (tx) =>
        tx.points.reminderAuthors({
          draftsSince: SINCE,
          monday: calDate(2026, 11, 2),
          meetingDate: calDate(2026, 11, 2),
          deadlineAt,
        }),
    );

  it('keeps a report draft without an event date in the reminder: it cannot be late', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    await fixtures.startReport(author);
    expect(await waiting()).toEqual([author.id]);
  });
});
