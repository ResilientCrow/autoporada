/** The late reports a porada still waits for, as the preflight lists them (ADR 0035, design section 11). */
import { describe, expect, it } from 'vitest';

import { calDate } from '@/domain/time';

import { lateReportFixtures } from '../../../../test/support/late-reports';
import { setupWorld } from '../../../../test/support/world';
import { lateReportsExpected } from './late-reports';

const world = setupWorld();
const late = lateReportFixtures(world);

/** Monday 2 November 2026, deadline Saturday 31 October 20.00 Prague (19.00Z). */
const MONDAY = calDate(2026, 11, 2);
const SLOT = { meetingDate: MONDAY, deadlineAt: new Date('2026-10-31T19:00:00Z') };
const SUNDAY_21 = { day: '2026-11-01', timeTo: '21:00' };
const SUNDAY_NO_END = { day: '2026-11-01', timeTo: null };

const expectedAs = (user: Parameters<typeof world.as>[0]) =>
  world.tx(world.as(user), (tx) => lateReportsExpected(tx, SLOT), 'read');

describe('lateReportsExpected', () => {
  it('lists the akce nobody wrote a report for, with the close, sorted by close and then title', async () => {
    const head = await world.seed.user({ role: 'headmaster' });
    const author = await world.seed.user({ role: 'submitter' });
    const second = await late.akce(author, SUNDAY_21, { title: 'Beta' });
    const first = await late.akce(author, SUNDAY_NO_END, { title: 'Zeta' });
    const tie = await late.akce(author, SUNDAY_NO_END, { title: 'Alfa' });
    expect(await expectedAs(head)).toEqual([
      { id: tie, of: 'akce', title: 'Alfa', due: new Date('2026-11-01T21:00:00Z') },
      { id: first, of: 'akce', title: 'Zeta', due: new Date('2026-11-01T21:00:00Z') },
      { id: second, of: 'akce', title: 'Beta', due: new Date('2026-11-01T22:00:00Z') },
    ]);
  });

  it('leaves out what is not late, not approved, not expecting a report, or already written', async () => {
    const head = await world.seed.user({ role: 'headmaster' });
    const author = await world.seed.user({ role: 'submitter' });
    await late.akce(author, { day: '2026-10-30', timeTo: '15:00' }); // closes with the deadline
    await late.akce(author, { day: '2026-11-02', timeTo: '10:00' }); // ends on the meeting day
    await late.akce(author, SUNDAY_21, { expectsReport: false });
    const written = await late.akce(author, SUNDAY_21);
    await late.patchAkce(author, written, { reportState: 'written' });
    const declined = await late.akce(author, SUNDAY_21);
    await late.patchAkce(author, declined, { reportState: 'declined' });
    const cancelled = await late.akce(author, SUNDAY_21);
    await late.patchAkce(author, cancelled, { state: 'cancelled' });
    const kept = await late.akce(author, SUNDAY_21);
    await late.patchAkce(author, kept, { reportState: 'prompted' });
    expect((await expectedAs(head)).map((e) => e.id)).toEqual([kept]);
  });

  it('counts a multi-day akce from its last day', async () => {
    const head = await world.seed.user({ role: 'headmaster' });
    const author = await world.seed.user({ role: 'submitter' });
    const id = await late.akce(author, {
      day: '2026-10-29',
      endDay: '2026-11-01',
      timeTo: '21:00',
    });
    expect((await expectedAs(head)).map((e) => [e.id, e.due])).toEqual([
      [id, new Date('2026-11-01T22:00:00Z')],
    ]);
  });

  it('shows an author their own drafts and returned reports, an akce linked to a draft once, as the draft', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const draft = await late.report(author, SUNDAY_21);
    const returned = await late.report(author, SUNDAY_NO_END, 'returned', MONDAY);
    const done = await late.report(author, SUNDAY_21, 'submitted', MONDAY);
    const early = await late.report(author, { day: '2026-10-30', timeTo: '15:00' });
    const linkedAkce = await late.akce(author, SUNDAY_21);
    const linked = await late.report(author, SUNDAY_21);
    await late.patchAkce(author, linkedAkce, { reportPointId: linked });
    const listed = await expectedAs(author);
    expect(listed.map((e) => [e.id, e.of]).sort()).toEqual(
      [
        [draft, 'point'],
        [returned, 'point'],
        [linked, 'point'],
      ].sort(),
    );
    expect(listed.map((e) => e.id)).not.toContain(done);
    expect(listed.map((e) => e.id)).not.toContain(early);
    expect(listed.map((e) => e.id)).not.toContain(linkedAkce);
  });

  // The known gap (TODO(m9-verify) in late-reports.ts): the headmaster's web read does not see
  // another author's drafts, so the preflight lists only the akce awaiting a report for them.
  it('shows the headmaster the akce but not another author’s draft, only their own', async () => {
    const head = await world.seed.user({ role: 'headmaster' });
    const author = await world.seed.user({ role: 'submitter' });
    const awaiting = await late.akce(author, SUNDAY_21);
    await late.report(author, SUNDAY_21);
    const own = await late.report(head, SUNDAY_21);
    expect((await expectedAs(head)).map((e) => e.id).sort()).toEqual([awaiting, own].sort());
  });

  it('judges lateness against the deadline of the porada it is given', async () => {
    const head = await world.seed.user({ role: 'headmaster' });
    const author = await world.seed.user({ role: 'submitter' });
    await late.akce(author, SUNDAY_21); // closes 23.00 Sunday
    const laterDeadline = { meetingDate: MONDAY, deadlineAt: new Date('2026-11-01T22:30:00Z') };
    expect(
      await world.tx(world.as(head), (tx) => lateReportsExpected(tx, laterDeadline), 'read'),
    ).toEqual([]);
  });
});
