/** The headmaster summary (design section 13): which window, which issues, who is told, what the counts say. */
import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  system,
  type IssueRecord,
  type JobInput,
  type PointRecord,
  type UserRecord,
  type WorkerDeps,
} from '@/application/ports';
import { deadline, DEFAULT_DEADLINE } from '@/domain/calendar';
import { schoolYear } from '@/domain/cs';
import type { IssueStatus } from '@/domain/review';
import { addDays, calDate, toIsoDate } from '@/domain/time';

import { lateReportFixtures } from '../../../test/support/late-reports';
import { createFakeMail } from '../../../test/support/fake-mail';
import { pointFixtures } from '../../../test/support/points';
import { setupWorld } from '../../../test/support/world';
import { JOB_HANDLERS } from './index';
import { unusedConverter } from '../../../test/support/fake-converter';

const world = setupWorld();
const points = pointFixtures(world);
const late = lateReportFixtures(world);

/** Monday 2 November 2026: the deadline is Saturday 31 October 20:00 Prague, 19:00Z. */
const MONDAY = calDate(2026, 11, 2);
const KEY_DAY = toIsoDate(MONDAY);
const DEADLINE = deadline(MONDAY, DEFAULT_DEADLINE);
const MINUTE = 60_000;
const HOUR = 3_600_000;
const OPEN = new Date(DEADLINE.getTime() + 5 * MINUTE);
const ORIGIN = 'https://autoporada.test';

const job = (): JobInput<'headmaster.summary'> => ({
  id: randomUUID(),
  data: {},
  attempt: 1,
  dedupeKey: null,
  redriven: false,
});
const fake = createFakeMail();
/** The worker's side: autoporada_worker in the pg world. A summary run sends no mail itself. */
const deps = (): WorkerDeps => ({
  db: world.workerDb,
  clock: world.clock,
  appOrigin: ORIGIN,
  converter: unusedConverter,
  mail: { send: () => Promise.reject(new Error('a summary run sends no mail')) },
});
const runAt = (instant: Date) => {
  world.clock.set(instant);
  return JOB_HANDLERS['headmaster.summary'](deps(), job());
};
const after = (minutes: number) => new Date(DEADLINE.getTime() + minutes * MINUTE);

async function queued() {
  const jobs = await world.inspect.jobs();
  return jobs.map(({ data, options }) => ({
    data: data as { template: string; recipientId: string; subjectId: string },
    key: options.dedupeKey,
  }));
}
const keys = async () => (await queued()).map((q) => q.key).sort();
const key = (user: UserRecord, day = KEY_DAY) => `headmaster.summary:${user.id}:${day}`;

const headmaster = (over: Parameters<typeof world.seed.user>[0] = {}) =>
  world.seed.user({ role: 'headmaster', email: 'reditel@ssps.cz', ...over });
const author = () => world.seed.user({ role: 'submitter' });

/** The issue row of the Monday, as frozen when the first point was handed in for it. */
const issueRow = async (status: IssueStatus = 'open', monday = MONDAY) =>
  world.tx(system('test.seed'), async (tx) => {
    const { issue } = await tx.issues.ensure({
      monday,
      meetingDate: monday,
      schoolYear: schoolYear(monday),
      deadlineAt: deadline(monday, DEFAULT_DEADLINE),
    });
    if (status !== 'open') await tx.issues.setStatus(issue.id, issue.version, status);
    return issue;
  });

/** The porada of `row` dropped: its row is gone, and the calendar is rows up to the next Monday's. */
async function dropRow(row: IssueRecord) {
  const heir = addDays(row.monday, 7);
  await world.tx(system('test.seed'), (tx) => tx.issues.remove(row.id, row.version));
  await world.seed.setting('calendar', { plannedThrough: toIsoDate(heir) });
  await issueRow('open', heir);
}

/** A pokyn of the author's left in `state` at `when`, first handed in for `earliest`, last for `handIn`. */
async function pointAt(
  by: UserRecord,
  state: PointRecord['state'],
  when: Date,
  earliest = MONDAY,
  handIn = earliest,
) {
  world.clock.set(when);
  const id = await points.start(by, 'pokyn');
  if (state !== 'draft') await points.moveTo(by, id, state, earliest, handIn);
  return id;
}
const thursday = new Date('2026-10-29T09:00:00Z');

/** Changes the user's access after they have worked. */
const afterwards = (user: UserRecord, patch: Parameters<typeof world.seed.user>[0]) =>
  world.tx(system('test.seed'), async (tx) => {
    const current = await tx.users.lock(user.id);
    await tx.users.changeAccess(user.id, current!.version, patch ?? {});
  });

describe('when the summary is due', () => {
  it('mails a headmaster five minutes after the deadline, with ids only and one key per Monday', async () => {
    const head = await headmaster();
    await issueRow();
    expect(await runAt(after(5 - 1))).toEqual({ kind: 'done', code: 'none' });
    expect(await queued()).toEqual([]);

    expect(await runAt(OPEN)).toEqual({ kind: 'done', code: 'summarised' });
    const [only, ...rest] = await queued();
    expect(rest).toEqual([]);
    expect(only).toEqual({
      data: { template: 'headmaster.summary', recipientId: head.id, subjectId: head.id },
      key: key(head),
    });
  });

  it('adds nothing on a later tick of the window, and nothing once two hours are past', async () => {
    const head = await headmaster();
    await issueRow();
    await runAt(OPEN);
    await runAt(after(10));
    await runAt(after(119));
    expect(await keys()).toEqual([key(head)]);
    expect(await runAt(after(120))).toEqual({ kind: 'done', code: 'none' });
  });

  it('does nothing for a Monday without an issue row, or once the porada is dropped', async () => {
    await headmaster();
    expect(await runAt(OPEN)).toEqual({ kind: 'done', code: 'none' });
    await dropRow(await issueRow());
    expect(await runAt(OPEN)).toEqual({ kind: 'done', code: 'none' });
    expect(await queued()).toEqual([]);
  });

  it('follows a frozen deadline, not the rule: a later one opens later', async () => {
    const head = await headmaster();
    const later = new Date(DEADLINE.getTime() + 3 * HOUR);
    await world.tx(system('test.seed'), (tx) =>
      tx.issues.ensure({
        monday: MONDAY,
        meetingDate: MONDAY,
        schoolYear: schoolYear(MONDAY),
        deadlineAt: later,
      }),
    );
    expect(await runAt(OPEN)).toEqual({ kind: 'done', code: 'none' });
    expect(await runAt(new Date(later.getTime() + 5 * MINUTE))).toEqual({
      kind: 'done',
      code: 'summarised',
    });
    expect(await keys()).toEqual([key(head)]);
  });

  it('asks nobody when the ledger holds the key already', async () => {
    const head = await headmaster();
    await issueRow();
    world.clock.set(OPEN);
    await world.workerDb.transaction(
      { principal: system('job:test'), now: OPEN, requestId: 'seed' },
      { mode: 'write' },
      (tx) =>
        tx.mailLedger.skip({
          dedupeKey: key(head),
          template: 'headmaster.summary',
          recipientId: head.id,
          subjectId: head.id,
          code: 'skipped.stale',
        }),
    );
    expect(await runAt(OPEN)).toEqual({ kind: 'done', code: 'none' });
    expect(await queued()).toEqual([]);
  });
});

describe('who is told', () => {
  it('mails each headmaster who can sign in, and no reviewer, submitter or blocked account', async () => {
    const [first, second, blocked, deactivated] = [
      await headmaster(),
      await headmaster(),
      await headmaster(),
      await headmaster(),
    ];
    await world.seed.user({ role: 'reviewer' });
    await author();
    await afterwards(blocked, { status: 'blocked' });
    await afterwards(deactivated, { status: 'deactivated' });
    await issueRow();
    await runAt(OPEN);
    expect(await keys()).toEqual([key(first), key(second)].sort());
  });
});

describe('the mail that goes out', () => {
  /** Runs the queued summary of `to` through mail.send, as the worker does. */
  async function deliver(to: UserRecord, at = OPEN) {
    world.clock.set(at);
    const [mail] = (await queued()).filter((q) => q.key === key(to));
    const input: JobInput<'mail.send'> = {
      id: randomUUID(),
      data: { template: 'headmaster.summary', recipientId: to.id, subjectId: to.id },
      attempt: 1,
      dedupeKey: mail!.key,
      redriven: false,
    };
    return JOB_HANDLERS['mail.send']({ ...deps(), mail: fake }, input);
  }
  const textOf = (approved: number, pending: number, returned: number) =>
    `uzávěrka porady z\u00a02.\u00a0listopadu 2026 proběhla. Schváleno: ${approved}, čeká na kontrolu: ${pending}, vráceno k\u00a0úpravě: ${returned}.\n\n${ORIGIN}/#/kontrola`;

  it('counts the approved, waiting and returned points of the Monday as they stand when it goes', async () => {
    const head = await headmaster();
    const [a, b] = [await author(), await author()];
    await issueRow();
    await pointAt(a, 'approved', thursday);
    await pointAt(a, 'submitted', thursday);
    await pointAt(b, 'submitted', thursday);
    await pointAt(b, 'returned', thursday);
    await pointAt(b, 'draft', thursday);
    await pointAt(b, 'rejected', thursday);
    await runAt(OPEN);
    await pointAt(a, 'submitted', thursday);
    expect(await deliver(head)).toMatchObject({ kind: 'done', code: 'sent' });
    expect(fake.calls.at(-1)?.mail.text).toContain(textOf(1, 3, 1));
  });

  it('leaves out a point for a later meeting, and one handed in after the deadline', async () => {
    const head = await headmaster();
    const writer = await author();
    await issueRow();
    await pointAt(writer, 'submitted', thursday);
    await pointAt(writer, 'submitted', thursday, calDate(2026, 11, 9));
    await pointAt(writer, 'submitted', after(2), MONDAY, addDays(MONDAY, 7));
    await runAt(OPEN);
    expect(await deliver(head)).toMatchObject({ code: 'sent' });
    expect(fake.calls.at(-1)?.mail.text).toContain(textOf(0, 1, 0));
  });

  it('counts a point approved for an earlier Monday that no meeting has used yet', async () => {
    const head = await headmaster();
    await issueRow();
    await pointAt(
      await author(),
      'approved',
      new Date('2026-10-20T09:00:00Z'),
      calDate(2026, 10, 19),
    );
    await runAt(OPEN);
    await deliver(head);
    expect(fake.calls.at(-1)?.mail.text).toContain(textOf(1, 0, 0));
  });

  it('still counts the points once the issue is generated', async () => {
    const head = await headmaster();
    await issueRow();
    await pointAt(await author(), 'approved', thursday);
    await runAt(OPEN);
    await issueRow('generated');
    await deliver(head);
    expect(fake.calls.at(-1)?.mail.text).toContain(textOf(1, 0, 0));
  });

  it('says nothing when the porada was dropped meanwhile', async () => {
    const head = await headmaster();
    const row = await issueRow();
    await runAt(OPEN);
    await dropRow(row);
    const sent = fake.calls.length;
    expect(await deliver(head)).toEqual({ kind: 'done', code: 'skipped.stale' });
    expect(fake.calls).toHaveLength(sent);
  });

  it('says nothing once the two hours are over, as a held-up mail would say it late', async () => {
    const head = await headmaster();
    await issueRow();
    await runAt(OPEN);
    const sent = fake.calls.length;
    expect(await deliver(head, after(121))).toEqual({ kind: 'done', code: 'skipped.stale' });
    expect(fake.calls).toHaveLength(sent);
  });

  it('skips a summary to a headmaster who can no longer sign in by the time it goes out', async () => {
    const [head] = [await headmaster(), await headmaster()];
    await issueRow();
    await runAt(OPEN);
    await afterwards(head, { status: 'blocked' });
    expect(await deliver(head)).toEqual({ kind: 'done', code: 'skipped.stale' });
  });
});

describe('the late reports of the porada (ADR 0035)', () => {
  // A report on Sunday 1 November ending at 21:00 closes at 23:00 Prague (22:00Z), after the deadline.
  const LAST_CLOSE = new Date('2026-11-01T22:00:00Z');
  const SUNDAY = { day: '2026-11-01', timeTo: '21:00' };
  const lateKey = (user: UserRecord, day = KEY_DAY) => `headmaster.late-summary:${user.id}:${day}`;
  const secondAt = (minutes: number) => new Date(LAST_CLOSE.getTime() + minutes * MINUTE);

  /** Runs the queued mail of `key` through mail.send and returns the text sent. */
  async function deliver(
    to: UserRecord,
    template: 'headmaster.summary' | 'headmaster.late-summary',
  ) {
    const mail = (await queued()).find(
      (q) => q.data.template === template && q.data.recipientId === to.id,
    );
    const outcome = await JOB_HANDLERS['mail.send'](
      { ...deps(), mail: fake },
      {
        id: randomUUID(),
        data: mail!.data as Parameters<(typeof JOB_HANDLERS)['mail.send']>[1]['data'],
        attempt: 1,
        dedupeKey: mail!.key,
        redriven: false,
      },
    );
    return { outcome, text: fake.calls.at(-1)?.mail.text ?? '' };
  }

  it('adds the count and the last close to the first summary', async () => {
    const head = await headmaster();
    await issueRow();
    await late.akce(await author(), SUNDAY);
    await late.report(await author(), { day: '2026-11-01', timeTo: null }, 'draft', MONDAY);
    await runAt(OPEN);
    const { outcome, text } = await deliver(head, 'headmaster.summary');
    expect(outcome).toMatchObject({ code: 'sent' });
    expect(text).toContain('Pozdní zprávy, které ještě chybí: 2.');
    expect(text).toContain('23:00');
  });

  it('leaves the line out when no report is late', async () => {
    const head = await headmaster();
    await issueRow();
    await late.akce(await author(), { day: '2026-10-30', timeTo: '15:00' }); // closes with the deadline
    await runAt(OPEN);
    await deliver(head, 'headmaster.summary');
    expect(fake.calls.at(-1)?.mail.text).not.toContain('Pozdní zprávy');
  });

  it('sends the second summary from five minutes after the last close, for two hours, once', async () => {
    const head = await headmaster();
    await issueRow();
    await late.akce(await author(), SUNDAY);
    expect(await runAt(secondAt(5 - 1))).toEqual({ kind: 'done', code: 'none' });
    expect(await queued()).toEqual([]);
    expect(await runAt(secondAt(5))).toEqual({ kind: 'done', code: 'summarised' });
    expect(await keys()).toEqual([lateKey(head)]);
    await runAt(secondAt(60));
    await runAt(secondAt(119));
    expect(await keys()).toEqual([lateKey(head)]);
    expect(await runAt(secondAt(120))).toEqual({ kind: 'done', code: 'none' });
  });

  it('counts what was handed in and what is still missing', async () => {
    const head = await headmaster();
    await issueRow();
    await late.akce(await author(), SUNDAY); // nobody started it
    await late.report(await author(), SUNDAY, 'draft', MONDAY);
    await late.report(await author(), SUNDAY, 'submitted', MONDAY);
    await late.report(await author(), SUNDAY, 'approved', MONDAY);
    await runAt(secondAt(5));
    const { outcome, text } = await deliver(head, 'headmaster.late-summary');
    expect(outcome).toMatchObject({ code: 'sent' });
    expect(text).toContain('Odevzdáno: 2, chybí: 2.');
  });

  it('sends the second summary also when every late report was handed in', async () => {
    const head = await headmaster();
    await issueRow();
    await late.report(await author(), SUNDAY, 'submitted', MONDAY);
    await runAt(secondAt(5));
    expect(await keys()).toEqual([lateKey(head)]);
    const { text } = await deliver(head, 'headmaster.late-summary');
    expect(text).toContain('Odevzdáno: 1, chybí: 0.');
  });

  it('sends none when the porada has no late report, or when it is dropped', async () => {
    await headmaster();
    const row = await issueRow();
    expect(await runAt(secondAt(5))).toEqual({ kind: 'done', code: 'none' });
    await late.akce(await author(), SUNDAY);
    await dropRow(row);
    expect(await runAt(secondAt(5))).toEqual({ kind: 'done', code: 'none' });
    expect(await queued()).toEqual([]);
  });

  it('is a key of its own per headmaster and Monday, apart from the first summary', async () => {
    const [first, second] = [await headmaster(), await headmaster()];
    await issueRow();
    await late.akce(await author(), SUNDAY);
    await runAt(OPEN);
    await runAt(secondAt(5));
    expect(await keys()).toEqual([key(first), key(second), lateKey(first), lateKey(second)].sort());
  });

  it('says nothing at send time once the window is over', async () => {
    const head = await headmaster();
    await issueRow();
    await late.akce(await author(), SUNDAY);
    await runAt(secondAt(5));
    world.clock.set(secondAt(121));
    const { outcome } = await deliver(head, 'headmaster.late-summary');
    expect(outcome).toEqual({ kind: 'done', code: 'skipped.stale' });
  });
});
