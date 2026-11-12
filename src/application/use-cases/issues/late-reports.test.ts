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

const lateAs = (user: Parameters<typeof world.as>[0]) =>
  world.tx(world.as(user), (tx) => lateReportsExpected(tx, SLOT), 'read');
const expectedAs = async (user: Parameters<typeof world.as>[0]) => (await lateAs(user)).expected;

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

  it('leaves out what is not late, not approved, a jednání, or already written', async () => {
    const head = await world.seed.user({ role: 'headmaster' });
    const author = await world.seed.user({ role: 'submitter' });
    await late.akce(author, { day: '2026-10-30', timeTo: '15:00' }); // closes with the deadline
    await late.akce(author, { day: '2026-11-02', timeTo: '10:00' }); // ends on the meeting day
    await late.jednani(author, SUNDAY_21);
    const written = await late.akce(author, SUNDAY_21);
    await late.patchAkce(author, written, { reportState: 'written' });
    const cancelled = await late.akce(author, SUNDAY_21);
    await late.patchAkce(author, cancelled, { state: 'cancelled' });
    const kept = await late.akce(author, SUNDAY_21);
    await late.patchAkce(author, kept, { reportState: 'prompted' });
    expect((await expectedAs(head)).map((e) => e.id)).toEqual([kept]);
  });

  it('counts a multi-day akce from its last day, at 20.00: it carries no time (ADR 0060)', async () => {
    const head = await world.seed.user({ role: 'headmaster' });
    const author = await world.seed.user({ role: 'submitter' });
    const id = await late.akce(author, {
      day: '2026-10-29',
      endDay: '2026-11-01',
      timeTo: '21:00',
    });
    expect((await expectedAs(head)).map((e) => [e.id, e.due])).toEqual([
      [id, new Date('2026-11-01T21:00:00Z')],
    ]);
  });

  it('shows an author their own unlinked drafts and returned reports; an akce linked to a draft once, as the akce', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const draft = await late.report(author, SUNDAY_21);
    const returned = await late.report(author, SUNDAY_NO_END, 'returned', MONDAY);
    const done = await late.report(author, SUNDAY_21, 'submitted', MONDAY);
    const early = await late.report(author, { day: '2026-10-30', timeTo: '15:00' });
    const linkedAkce = await late.akce(author, SUNDAY_21, { title: 'Hlavní akce' });
    const linked = await late.report(author, SUNDAY_21);
    await late.patchAkce(author, linkedAkce, { reportState: 'written', reportPointId: linked });
    const listed = await expectedAs(author);
    expect(listed.map((e) => [e.id, e.of]).sort()).toEqual(
      [
        [draft, 'point'],
        [returned, 'point'],
        [linkedAkce, 'akce'],
      ].sort(),
    );
    expect(listed.find((e) => e.id === linkedAkce)?.title).toBe('Hlavní akce');
    expect(listed.map((e) => e.id)).not.toContain(linked);
    expect(listed.map((e) => e.id)).not.toContain(done);
    expect(listed.map((e) => e.id)).not.toContain(early);
  });

  it.each(['draft', 'returned'] as const)(
    'keeps an akce in the headmaster’s list once its report is started and %s, under the akce’s own title',
    async (state) => {
      const head = await world.seed.user({ role: 'headmaster' });
      const author = await world.seed.user({ role: 'submitter' });
      const id = await late.akce(author, SUNDAY_21, { title: 'Beseda' });
      const report = await late.report(author, SUNDAY_21, state, MONDAY);
      await late.patchAkce(author, id, { reportState: 'written', reportPointId: report });
      const result = await lateAs(head);
      expect(result.expected).toEqual([
        { id, of: 'akce', title: 'Beseda', due: new Date('2026-11-01T22:00:00Z') },
      ]);
      expect(result.hiddenDrafts).toBe(0);
    },
  );

  it('drops an akce whose started report is handed in', async () => {
    const head = await world.seed.user({ role: 'headmaster' });
    const author = await world.seed.user({ role: 'submitter' });
    const id = await late.akce(author, SUNDAY_21);
    const report = await late.report(author, SUNDAY_21, 'submitted', MONDAY);
    await late.patchAkce(author, id, { reportState: 'written', reportPointId: report });
    expect(await lateAs(head)).toEqual({ expected: [], hiddenDrafts: 0 });
  });

  it('gives the headmaster another author’s never-submitted drafts as a count, never as a title', async () => {
    const head = await world.seed.user({ role: 'headmaster' });
    const author = await world.seed.user({ role: 'submitter' });
    const awaiting = await late.akce(author, SUNDAY_21);
    await late.report(author, SUNDAY_21);
    await late.report(author, SUNDAY_21);
    await late.report(author, { day: '2026-10-30', timeTo: '15:00' }); // not late
    // A returned report was handed in once, so the reviewers already read it.
    const returned = await late.report(author, SUNDAY_NO_END, 'returned', MONDAY);
    const own = await late.report(head, SUNDAY_21);
    const result = await lateAs(head);
    expect(result.expected.map((e) => e.id).sort()).toEqual([awaiting, returned, own].sort());
    expect(result.hiddenDrafts).toBe(2);
  });

  it('does not count a draft linked to an akce twice', async () => {
    const head = await world.seed.user({ role: 'headmaster' });
    const author = await world.seed.user({ role: 'submitter' });
    const id = await late.akce(author, SUNDAY_21);
    const report = await late.report(author, SUNDAY_21);
    await late.patchAkce(author, id, { reportState: 'written', reportPointId: report });
    expect((await lateAs(head)).hiddenDrafts).toBe(0);
  });

  it('judges lateness against the deadline of the porada it is given', async () => {
    const head = await world.seed.user({ role: 'headmaster' });
    const author = await world.seed.user({ role: 'submitter' });
    await late.akce(author, SUNDAY_21); // closes 23.00 Sunday
    const laterDeadline = { meetingDate: MONDAY, deadlineAt: new Date('2026-11-01T22:30:00Z') };
    expect(
      await world.tx(world.as(head), (tx) => lateReportsExpected(tx, laterDeadline), 'read'),
    ).toEqual({ expected: [], hiddenDrafts: 0 });
  });
});
