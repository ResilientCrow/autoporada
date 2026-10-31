import { describe, expect, it } from 'vitest';

import { system, type UserRecord } from '@/application/ports';
import { decidePoint } from '@/application/use-cases';
import { deadline, DEFAULT_DEADLINE } from '@/domain/calendar';
import { schoolYear } from '@/domain/cs';
import { calDate } from '@/domain/time';
import { TEMPLATE_NAMES, type TemplateName } from '@/notify';

import { futureFixtures } from '../../../test/support/future';
import { pointFixtures } from '../../../test/support/points';
import { setupWorld } from '../../../test/support/world';
import { loadSubject } from './index';

const world = setupWorld();
const { start, moveTo, snapshot } = pointFixtures(world);
const { start: futureStart, moveTo: futureMoveTo } = futureFixtures(world);
const MISSING = '00000000-0000-7000-8000-00000000dead';

/** Reads as the worker does, in one transaction. */
const load = <T extends TemplateName>(template: T, id: string) =>
  world.workerDb.transaction(
    { principal: system('job:mail.send'), now: world.clock.now(), requestId: 'test' },
    { mode: 'read' },
    (tx) => loadSubject(tx, template, id),
  );

describe('loadSubject', () => {
  it('reads the decided request for the access decisions', async () => {
    const head = await world.seed.user({ role: 'headmaster' });
    const user = await world.seed.user({ role: 'pending' });
    for (const [template, state] of [
      ['access.approved', 'approved'],
      ['access.rejected', 'rejected'],
      ['access.blocked', 'blocked'],
    ] as const) {
      const request = await world.seed.accessRequest({
        userId: user.id,
        state,
        decidedBy: head.id,
      });
      const subject = await load(template, request.id);
      expect(subject?.id).toBe(request.id);
      expect(subject?.state).toBe(state);
    }
  });

  it('reads the user for a grant and for the test mail', async () => {
    const user = await world.seed.user({ role: 'submitter' });
    for (const template of ['access.granted', 'mail.check'] as const) {
      const subject = await load(template, user.id);
      expect(subject?.id).toBe(user.id);
      expect(subject?.role).toBe('submitter');
    }
  });

  it('reads the decision event and its point for the decision mails', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const reviewer = await world.seed.user({ role: 'reviewer' });
    const id = await start(author, 'pokyn');
    await moveTo(author, id, 'submitted');
    const input = { id, event: 'reject', expectedVersion: 2, note: 'Nepatří na poradu.' };
    expect((await world.run(decidePoint, world.as(reviewer), input)).ok).toBe(true);
    const [event] = (await snapshot(id)).events;
    const subject = { id: event!.id, pointId: id, event: 'reject', toState: 'rejected' };
    for (const template of ['point.returned', 'point.approved', 'point.rejected'] as const) {
      expect(await load(template, event!.id)).toEqual({
        event: subject,
        point: { id, authorId: author.id, state: 'rejected' },
      });
    }
    // The subject is the event, never the point it belongs to.
    expect(await load('point.rejected', id)).toBeNull();
  });

  it('reads the author and the standing of the akce for the report prompt', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const id = await futureStart(author);
    await futureMoveTo(author, id, 'approved');
    expect(await load('report.prompt', id)).toEqual({
      id,
      authorId: author.id,
      state: 'approved',
      reportState: 'none',
    });
  });

  describe('the reminders, read at the time the mail goes', () => {
    const MONDAY = calDate(2026, 10, 26);
    const SOFT = new Date('2026-10-22T11:00:00Z');
    const HARD = new Date('2026-10-24T10:00:00Z');

    it('gives the Monday while the soft slot is open, and nothing before or after', async () => {
      const user = await world.seed.user({ role: 'submitter' });
      world.clock.set(new Date(SOFT.getTime() - 1));
      expect(await load('reminder.soft', user.id)).toBeNull();
      world.clock.set(SOFT);
      expect(await load('reminder.soft', user.id)).toEqual({
        monday: MONDAY,
        meetingDate: MONDAY,
        hasWork: false,
      });
      world.clock.set(new Date(SOFT.getTime() + 6 * 3_600_000));
      expect(await load('reminder.soft', user.id)).toBeNull();
    });

    it('drops a mail queued for a Monday that was skipped afterwards, and speaks for the next one', async () => {
      const user = await world.seed.user({ role: 'submitter' });
      // The mail for 26 October was queued at its soft slot; then the headmaster skipped that Monday.
      await world.tx(system('test.seed'), async (tx) => {
        const { issue } = await tx.issues.ensure({
          monday: MONDAY,
          meetingDate: MONDAY,
          schoolYear: schoolYear(MONDAY),
          deadlineAt: deadline(MONDAY, DEFAULT_DEADLINE),
        });
        await tx.issues.setStatus(issue.id, issue.version, 'skipped');
      });
      world.clock.set(SOFT);
      expect(await load('reminder.soft', user.id)).toBeNull();
      // The Monday after has its own soft slot, Thursday 29 October 13.00 Prague.
      world.clock.set(new Date('2026-10-29T12:00:00Z'));
      expect(await load('reminder.soft', user.id)).toEqual({
        monday: calDate(2026, 11, 2),
        meetingDate: calDate(2026, 11, 2),
        hasWork: false,
      });
    });

    it('tells the hard one whether the recipient still has a draft for the Monday', async () => {
      const author = await world.seed.user({ role: 'submitter' });
      const idle = await world.seed.user({ role: 'submitter' });
      world.clock.set(new Date('2026-10-20T08:00:00Z'));
      await start(author);
      world.clock.set(HARD);
      expect(await load('reminder.hard', author.id)).toEqual({
        monday: MONDAY,
        meetingDate: MONDAY,
        hasWork: true,
      });
      expect(await load('reminder.hard', idle.id)).toEqual({
        monday: MONDAY,
        meetingDate: MONDAY,
        hasWork: false,
      });
      world.clock.set(new Date('2026-10-24T18:00:00Z'));
      expect(await load('reminder.hard', author.id)).toBeNull();
    });
  });

  describe('the reminders, after the headmaster switched a kind off', () => {
    const SOFT = new Date('2026-10-22T11:00:00Z');
    const HARD = new Date('2026-10-24T10:00:00Z');
    const switches = (value: { soft: boolean; hard: boolean }) =>
      world.seed.setting('reminders', value);

    it('drops a soft mail queued before the switch, and keeps the hard one', async () => {
      const user = await world.seed.user({ role: 'submitter' });
      world.clock.set(SOFT);
      expect(await load('reminder.soft', user.id)).not.toBeNull();
      await switches({ soft: false, hard: true });
      expect(await load('reminder.soft', user.id)).toBeNull();
      world.clock.set(HARD);
      expect(await load('reminder.hard', user.id)).not.toBeNull();
    });

    it('drops a hard mail queued before the switch, and keeps the soft one', async () => {
      const author = await world.seed.user({ role: 'submitter' });
      world.clock.set(new Date('2026-10-20T08:00:00Z'));
      await start(author);
      world.clock.set(HARD);
      expect(await load('reminder.hard', author.id)).toEqual({
        monday: calDate(2026, 10, 26),
        meetingDate: calDate(2026, 10, 26),
        hasWork: true,
      });
      await switches({ soft: true, hard: false });
      expect(await load('reminder.hard', author.id)).toBeNull();
      world.clock.set(SOFT);
      expect(await load('reminder.soft', author.id)).not.toBeNull();
    });
  });

  describe('the reviewer digest, counted from the last one sent when the mail goes', () => {
    const NOW = new Date('2026-10-26T14:00:00Z');
    const HOUR = 3_600_000;
    const ago = (hours: number) => new Date(NOW.getTime() - hours * HOUR);

    /** A digest to `recipient` that reached them: claimed at `at`, then settled as sent. */
    const sentAt = async (recipient: UserRecord, at: Date) => {
      const key = `reviewer.digest:${recipient.id}:${at.toISOString()}`;
      await world.workerDb.transaction(
        { principal: system('job:mail.send'), now: at, requestId: 'seed' },
        { mode: 'write' },
        async (tx) => {
          await tx.mailLedger.claim({
            dedupeKey: key,
            template: 'reviewer.digest',
            recipientId: recipient.id,
            subjectId: recipient.id,
            unknownSends: 0,
            capFrom: 0,
            jobId: '00000000-0000-7000-8000-00000000b001',
          });
          await tx.mailLedger.settle(key, { state: 'sent', code: 'sent' });
        },
      );
    };
    /** A point and an akce handed in at `at`. */
    const handIn = async (author: UserRecord, at: Date) => {
      world.clock.set(at);
      await moveTo(author, await start(author, 'pokyn'), 'submitted');
      await futureMoveTo(author, await futureStart(author), 'submitted');
    };

    it('counts the last 24 hours for a reviewer who was never mailed, points and akce together', async () => {
      const reviewer = await world.seed.user({ role: 'reviewer' });
      const author = await world.seed.user({ role: 'submitter' });
      await handIn(author, ago(25));
      await handIn(author, ago(5));
      world.clock.set(NOW);
      expect(await load('reviewer.digest', reviewer.id)).toEqual({
        submitted: 2,
        accessRequests: 0,
      });
    });

    it('counts from the last digest that was sent, even when that is days back', async () => {
      const reviewer = await world.seed.user({ role: 'reviewer' });
      const author = await world.seed.user({ role: 'submitter' });
      await handIn(author, ago(80));
      await sentAt(reviewer, ago(72));
      await handIn(author, ago(30));
      await handIn(author, ago(2));
      world.clock.set(NOW);
      expect(await load('reviewer.digest', reviewer.id)).toEqual({
        submitted: 4,
        accessRequests: 0,
      });
      await sentAt(reviewer, ago(1));
      world.clock.set(NOW);
      expect(await load('reviewer.digest', reviewer.id)).toEqual({
        submitted: 0,
        accessRequests: 0,
      });
    });

    it('leaves out what the reviewer handed in themselves and what is no longer waiting', async () => {
      const reviewer = await world.seed.user({ role: 'reviewer' });
      const author = await world.seed.user({ role: 'submitter' });
      await handIn(reviewer, ago(3));
      world.clock.set(ago(3));
      await moveTo(author, await start(author, 'pokyn'), 'approved');
      world.clock.set(NOW);
      expect(await load('reviewer.digest', reviewer.id)).toEqual({
        submitted: 0,
        accessRequests: 0,
      });
    });

    it('tells a headmaster the access requests filed since, and a reviewer none', async () => {
      const head = await world.seed.user({ role: 'headmaster' });
      const reviewer = await world.seed.user({ role: 'reviewer' });
      for (const [hours, state] of [
        [30, 'pending'],
        [4, 'pending'],
        [3, 'pending'],
        [2, 'cancelled'],
      ] as const) {
        const user = await world.seed.user({ role: 'pending' });
        await world.seed.accessRequest({ userId: user.id, state, createdAt: ago(hours) });
      }
      world.clock.set(NOW);
      expect(await load('reviewer.digest', head.id)).toEqual({ submitted: 0, accessRequests: 2 });
      expect(await load('reviewer.digest', reviewer.id)).toEqual({
        submitted: 0,
        accessRequests: 0,
      });
    });
  });

  it.each(TEMPLATE_NAMES.filter((template) => template !== 'issue.moved'))(
    'gives null for a missing subject of %s',
    async (template) => {
      expect(await load(template, MISSING)).toBeNull();
    },
  );

  // The moved mail speaks for the slot open now; whether it still applies to this person is hasWork (still-applies).
  it('tells issue.moved of a missing user that they have no work', async () => {
    expect(await load('issue.moved', MISSING)).toMatchObject({ hasWork: false });
  });

  it('does not read a user through a request template', async () => {
    const user = await world.seed.user({ role: 'submitter' });
    expect(await load('access.approved', user.id)).toBeNull();
  });
});
