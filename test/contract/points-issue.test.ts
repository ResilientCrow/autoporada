import { describe, expect, it } from 'vitest';

import { system, type Principal } from '@/application/ports';
import { inIssue } from '@/domain/calendar';
import type { PointState } from '@/domain/review';
import { calDate, compareDates, parseIsoDate, type CalDate } from '@/domain/time';

import { issueFixtures } from '../support/issues';
import { setupWorld } from '../support/world';

const world = setupWorld();
const fixtures = issueFixtures(world);
const cli = system('cli:test');

const W1 = calDate(2026, 10, 26);
const W2 = calDate(2026, 11, 2);
const W3 = calDate(2026, 11, 9);
const d = parseIsoDate;

/** Far back: the reports that answer no akce ignore `since`. */
const LONG_AGO = calDate(2026, 1, 1);
const eligible = (
  monday: CalDate,
  meeting = monday,
  by: Principal = cli,
  since: CalDate = LONG_AGO,
) => world.tx(by, (tx) => tx.points.eligibleFor(monday, meeting, { since }), 'read');
const waiting = (monday: CalDate, meeting = monday, by: Principal = cli) =>
  world.tx(by, (tx) => tx.points.waitingFor(monday, meeting), 'read');
const titles = (points: readonly { content: { title: string } }[]) =>
  points.map((p) => p.content.title);

describe('PointRepo.eligibleFor (port contract)', () => {
  it('takes approved points due by the Monday, and keeps them in every later issue (cumulative)', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    await fixtures.point({ author, title: 'W1', earliest: W1 });
    await fixtures.point({ author, title: 'W2', earliest: W2 });
    expect(titles(await eligible(W1))).toEqual(['W1']);
    expect(titles(await eligible(W2)).sort()).toEqual(['W1', 'W2']);
    expect(titles(await eligible(calDate(2026, 10, 19)))).toEqual([]);
  });

  it('is due by the later of the first Monday and the hand-in Monday', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    await fixtures.point({ author, title: 'resubmitted', earliest: W1, handIn: W3 });
    expect(await eligible(W2)).toEqual([]);
    expect(titles(await eligible(W3))).toEqual(['resubmitted']);
  });

  it.each(['draft', 'submitted', 'returned', 'rejected', 'withdrawn'] as const)(
    'leaves out a %s point',
    async (state) => {
      const author = await world.seed.user({ role: 'submitter' });
      await fixtures.point({ author, state });
      expect(await eligible(W3)).toEqual([]);
    },
  );

  it('keeps a report back until its last day is before the meeting date', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    await fixtures.point({ author, kind: 'report', title: 'single', eventDate: d('2026-10-31') });
    await fixtures.point({
      author,
      kind: 'report',
      title: 'multi',
      eventDate: d('2026-10-30'),
      endDate: d('2026-11-02'),
    });
    expect(titles(await eligible(W2, W2))).toEqual(['single']);
    expect(titles(await eligible(W2, d('2026-11-03'))).sort()).toEqual(['multi', 'single']);
    // The meeting day itself is not before the meeting.
    expect(await eligible(W2, d('2026-10-31'))).toEqual([]);
    // Another meeting date moves the line, not the Monday.
    expect(titles(await eligible(W2, d('2026-11-01')))).toEqual(['single']);
  });

  it('takes finance and pokyn points whatever their dates', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    await fixtures.point({ author, kind: 'finance', title: 'F' });
    await fixtures.point({ author, kind: 'pokyn', title: 'P' });
    expect(titles(await eligible(W1, d('2026-10-20'))).sort()).toEqual(['F', 'P']);
  });

  it('lists them in the order handed in, ties to the lower id', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const at = new Date('2026-10-20T10:00:00Z');
    const later = await fixtures.point({
      author,
      title: 'later',
      submittedAt: new Date(at.getTime() + 1000),
    });
    const a = await fixtures.point({ author, title: 'a', submittedAt: at });
    const b = await fixtures.point({ author, title: 'b', submittedAt: at });
    const [first, second] = [a, b].sort();
    const got = await eligible(W1);
    expect(got.map((p) => p.id)).toEqual([first, second, later]);
  });

  it('stays within the read scope: an author sees their own, the headmaster and the system all', async () => {
    const one = await world.seed.user({ role: 'submitter' });
    const two = await world.seed.user({ role: 'submitter' });
    const head = await world.seed.user({ role: 'headmaster' });
    await fixtures.point({ author: one, title: 'one' });
    await fixtures.point({ author: two, title: 'two' });
    expect(titles(await eligible(W1, W1, world.as(one)))).toEqual(['one']);
    expect(titles(await eligible(W1, W1, world.as(head))).sort()).toEqual(['one', 'two']);
    expect(titles(await eligible(W1)).sort()).toEqual(['one', 'two']);
  });

  it('agrees with inIssue for every combination of state, Mondays and last day', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const states: PointState[] = ['approved', 'submitted', 'returned'];
    const mondays = [W1, W2, W3];
    const lastDays = [d('2026-10-30'), d('2026-11-02'), d('2026-11-08'), d('2026-11-09')];
    const seeded: {
      id: string;
      state: PointState;
      earliest: CalDate;
      handIn: CalDate;
      lastDay: CalDate;
    }[] = [];
    for (const state of states)
      for (const earliest of mondays)
        for (const handIn of mondays.filter((m) => compareDates(m, earliest) >= 0))
          for (const lastDay of lastDays) {
            const id = await fixtures.point({
              author,
              kind: 'report',
              state,
              earliest,
              handIn,
              eventDate: lastDay,
            });
            seeded.push({ id, state, earliest, handIn, lastDay });
          }
    for (const monday of mondays) {
      for (const meeting of [monday, d('2026-11-04'), d('2026-11-11')]) {
        const expected = seeded
          .filter((p) =>
            inIssue(
              {
                state: p.state,
                kind: 'report',
                earliest: p.earliest,
                handIn: p.handIn,
                lastDay: p.lastDay,
              },
              { monday, meetingDate: meeting },
            ),
          )
          .map((p) => p.id)
          .sort();
        const got = (await eligible(monday, meeting)).map((p) => p.id).sort();
        expect(
          got,
          `${monday.month}/${monday.day} meeting ${meeting.month}/${meeting.day}`,
        ).toEqual(expected);
      }
    }
  });
});

describe('PointRepo.eligibleFor: the report of an approved akce (ADR 0049)', () => {
  const SINCE = d('2026-10-26');
  const MEETING = d('2026-11-02');

  /** An akce ending on `lastDay` and its approved report, handed in for `handIn`. */
  async function reported(
    author: Awaited<ReturnType<typeof world.seed.user>>,
    lastDay: string,
    over: {
      handIn?: CalDate;
      eventDate?: CalDate;
      akce?: 'approved' | 'cancelled' | 'submitted' | 'returned';
      approvedBefore?: boolean;
    } = {},
  ) {
    const akce = await fixtures.future({
      author,
      title: `akce ${lastDay}`,
      startDate: d(lastDay),
      state: over.akce ?? 'approved',
      ...(over.approvedBefore && { approvedBefore: true }),
    });
    const point = await fixtures.point({
      author,
      kind: 'report',
      title: `zpráva ${lastDay}`,
      futureItemId: akce,
      earliest: W1,
      handIn: over.handIn ?? W1,
      eventDate: over.eventDate ?? d(lastDay),
    });
    return { akce, point };
  }

  it('goes by the akce: its last day from since to the day before the meeting', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    await reported(author, '2026-10-26');
    await reported(author, '2026-11-01');
    await reported(author, '2026-10-25');
    await reported(author, '2026-11-02');
    const got = await eligible(W2, MEETING, cli, SINCE);
    expect(titles(got).sort()).toEqual(['zpráva 2026-10-26', 'zpráva 2026-11-01']);
  });

  it("ignores the hand-in Monday and the report's own dates", async () => {
    const author = await world.seed.user({ role: 'submitter' });
    // Handed in for a later Monday, and the report names a day after the meeting.
    const { point } = await reported(author, '2026-10-30', {
      handIn: W3,
      eventDate: d('2026-11-20'),
    });
    expect((await eligible(W2, MEETING, cli, SINCE)).map((p) => p.id)).toEqual([point]);
  });

  it('leaves out a report that is not approved', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const akce = await fixtures.future({ author, startDate: d('2026-10-30') });
    for (const state of ['draft', 'submitted', 'returned', 'withdrawn'] as const) {
      await fixtures.point({ author, kind: 'report', state, futureItemId: akce });
    }
    expect(await eligible(W2, MEETING, cli, SINCE)).toEqual([]);
  });

  it('falls back to the report rules when the akce is not approved', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    // Cancelled akce: handed in for a later Monday, so not yet due.
    await reported(author, '2026-10-30', { akce: 'cancelled', handIn: W3 });
    expect(await eligible(W2, MEETING, cli, SINCE)).toEqual([]);
    // Cancelled akce: the report's own rules take it in.
    await reported(author, '2026-10-29', { akce: 'cancelled' });
    expect(titles(await eligible(W2, MEETING, cli, SINCE))).toEqual(['zpráva 2026-10-29']);
  });

  it.each(['submitted', 'returned'] as const)(
    'still goes by the akce when its author revised it after it was approved and it is %s',
    async (akce) => {
      const author = await world.seed.user({ role: 'submitter' });
      // Handed in for a later Monday and dated after the meeting: only the akce can bring it in.
      const { point } = await reported(author, '2026-10-30', {
        akce,
        approvedBefore: true,
        handIn: W3,
        eventDate: d('2026-11-20'),
      });
      expect((await eligible(W2, MEETING, cli, SINCE)).map((p) => p.id)).toEqual([point]);
    },
  );

  it('does not bind an akce in review that was never approved', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    await reported(author, '2026-10-30', { akce: 'submitted', handIn: W3 });
    expect(await eligible(W2, MEETING, cli, SINCE)).toEqual([]);
  });

  it('counts a multi-day akce by its end date', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const akce = await fixtures.future({
      author,
      title: 'camp',
      startDate: d('2026-10-20'),
      endDate: d('2026-10-28'),
    });
    await fixtures.point({ author, kind: 'report', title: 'camp report', futureItemId: akce });
    expect(titles(await eligible(W2, MEETING, cli, SINCE))).toEqual(['camp report']);
    expect(await eligible(W2, MEETING, cli, d('2026-10-29'))).toEqual([]);
  });

  it('keeps the read scope: an author sees only their own report', async () => {
    const one = await world.seed.user({ role: 'submitter' });
    const two = await world.seed.user({ role: 'submitter' });
    await reported(one, '2026-10-29');
    await reported(two, '2026-10-30');
    expect(titles(await eligible(W2, MEETING, world.as(one), SINCE))).toEqual([
      'zpráva 2026-10-29',
    ]);
    expect(await eligible(W2, MEETING, cli, SINCE)).toHaveLength(2);
  });
});

describe('PointRepo.waitingFor (port contract)', () => {
  it('splits what is not published into submitted, returned and reports for later', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    await fixtures.point({ author, title: 'S', state: 'submitted' });
    await fixtures.point({ author, title: 'R', state: 'returned' });
    await fixtures.point({ author, title: 'A', state: 'approved' });
    await fixtures.point({ author, title: 'D', state: 'draft' });
    await fixtures.point({ author, title: 'X', state: 'rejected' });
    await fixtures.point({
      author,
      kind: 'report',
      title: 'late report',
      eventDate: d('2026-11-03'),
    });
    await fixtures.point({
      author,
      kind: 'report',
      title: 'done report',
      eventDate: d('2026-10-30'),
    });
    const got = await waiting(W2, W2);
    expect(got.submitted.map((p) => p.title)).toEqual(['S']);
    expect(got.returned.map((p) => p.title)).toEqual(['R']);
    expect(got.later.map((p) => p.title)).toEqual(['late report']);
    expect(got.submitted[0]).toEqual({ id: expect.any(String), kind: 'pokyn', title: 'S' });
  });

  it('counts only points due by the Monday', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    await fixtures.point({ author, title: 'next week', state: 'submitted', earliest: W3 });
    expect((await waiting(W2)).submitted).toEqual([]);
    expect((await waiting(W3)).submitted.map((p) => p.title)).toEqual(['next week']);
  });

  it('stays within the read scope', async () => {
    const one = await world.seed.user({ role: 'submitter' });
    const two = await world.seed.user({ role: 'submitter' });
    await fixtures.point({ author: one, title: 'one', state: 'submitted' });
    await fixtures.point({ author: two, title: 'two', state: 'submitted' });
    expect((await waiting(W1, W1, world.as(one))).submitted.map((p) => p.title)).toEqual(['one']);
    expect((await waiting(W1)).submitted).toHaveLength(2);
  });

  it('puts an approved report of an akce that has not ended before the meeting in later', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const akce = await fixtures.future({ author, startDate: d('2026-11-03') });
    // Its own date says it ended; the akce decides.
    await fixtures.point({
      author,
      kind: 'report',
      title: 'early',
      futureItemId: akce,
      eventDate: d('2026-10-20'),
    });
    const ended = await fixtures.future({ author, startDate: d('2026-10-30') });
    await fixtures.point({
      author,
      kind: 'report',
      title: 'ended',
      futureItemId: ended,
      eventDate: d('2026-11-20'),
    });
    expect((await waiting(W2, W2)).later.map((p) => p.title)).toEqual(['early']);
  });
});
