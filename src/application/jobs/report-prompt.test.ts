/** The daily prompt for an akce's report (design section 13): which akce, which key, what the ledger already holds. */
import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  system,
  type FutureItemPatch,
  type JobInput,
  type UserRecord,
  type WorkerDeps,
} from '@/application/ports';
import { saveFuture } from '@/application/use-cases';

import { futureFixtures, readyAkce } from '../../../test/support/future';
import { setupWorld } from '../../../test/support/world';
import { JOB_HANDLERS } from './index';
import { unusedConverter } from '../../../test/support/fake-converter';

const world = setupWorld();
const { start, moveTo } = futureFixtures(world);

/** 08.00 in Prague, as the cron fires it. */
const at = (day: string) => new Date(`${day}T07:00:00Z`);
const job = (): JobInput<'future.report-prompt'> => ({
  id: randomUUID(),
  data: {},
  attempt: 1,
  dedupeKey: null,
  redriven: false,
});

/** The worker's side: autoporada_worker in the pg world. Mail is never sent by a prompt. */
const deps = (): WorkerDeps => ({
  db: world.workerDb,
  clock: world.clock,
  appOrigin: 'https://autoporada.test',
  converter: unusedConverter,
  mail: { send: () => Promise.reject(new Error('a prompt sends no mail')) },
});
const run = () => JOB_HANDLERS['future.report-prompt'](deps(), job());

/** An approved akce of the author with the given days (the last day is `endDate`, else `startDate`). */
async function approved(
  author: UserRecord,
  dates: { startDate: string; endDate?: string | null },
  over: Record<string, unknown> = {},
): Promise<string> {
  const id = await start(author, 'akce');
  const content = readyAkce({ endDate: null, ...dates, ...over });
  const saved = await world.run(saveFuture, world.as(author), { id, expectedVersion: 1, content });
  if (!saved.ok) throw new Error(`save refused: ${saved.error.code}`);
  await moveTo(author, id, 'approved');
  return id;
}

const patch = (author: UserRecord, id: string, over: FutureItemPatch) =>
  world.tx(world.as(author), async (tx) => {
    const item = (await tx.futureItems.loadForWrite(id))!;
    await tx.futureItems.update(id, item.version, over);
    await tx.audit.record({ action: 'future.test', target: { type: 'future_item', id } });
  });

/** What the run queued: the key of each mail.send, with its payload. */
async function queued() {
  const jobs = await world.inspect.jobs();
  return jobs.map(({ name, data, options }) => ({ name, data, key: options.dedupeKey }));
}
const keys = async () => (await queued()).map((q) => q.key).sort();

/** The ledger already holds `key`, as a mail that was sent for it. */
const inLedger = (recipient: UserRecord, itemId: string, key: string) =>
  world.workerDb.transaction(
    { principal: system('job:test'), now: world.clock.now(), requestId: 'seed' },
    { mode: 'write' },
    (tx) =>
      tx.mailLedger.skip({
        dedupeKey: key,
        template: 'report.prompt',
        recipientId: recipient.id,
        subjectId: itemId,
        code: 'skipped.stale',
      }),
  );

describe('the future.report-prompt handler', () => {
  it('asks the author for the report the day after the akce, with ids only', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const id = await approved(author, { startDate: '2026-11-10', endDate: '2026-11-11' });
    world.clock.set(at('2026-11-12'));
    expect(await run()).toEqual({ kind: 'done', code: 'prompted' });
    expect(await queued()).toEqual([
      {
        name: 'mail.send',
        data: { template: 'report.prompt', recipientId: author.id, subjectId: id },
        key: `report.prompt:${id}:1`,
      },
    ]);
  });

  it('counts the Prague day: half an hour after midnight there is already the day after', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const id = await approved(author, { startDate: '2026-11-11' });
    world.clock.set(new Date('2026-11-11T23:30:00Z'));
    await run();
    expect(await keys()).toEqual([`report.prompt:${id}:1`]);
  });

  it('asks nothing on the last day itself, nor while the akce goes on', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    await approved(author, { startDate: '2026-11-10', endDate: '2026-11-12' });
    await approved(author, { startDate: '2026-11-12' });
    world.clock.set(at('2026-11-12'));
    expect(await run()).toEqual({ kind: 'done', code: 'none' });
    expect(await queued()).toEqual([]);
  });

  it.each([
    ['the day after', '2026-11-12', 1],
    ['the seventh day after', '2026-11-18', 1],
    ['the eighth day after', '2026-11-19', 2],
    ['the 21st day after', '2026-12-02', 2],
  ] as const)('sends prompt %i on %s', async (_when, day, stage) => {
    const author = await world.seed.user({ role: 'submitter' });
    const id = await approved(author, { startDate: '2026-11-11' });
    world.clock.set(at(day));
    await run();
    expect(await keys()).toEqual([`report.prompt:${id}:${stage}`]);
  });

  it('stops asking after 21 days', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    await approved(author, { startDate: '2026-11-11' });
    world.clock.set(at('2026-12-03'));
    expect(await run()).toEqual({ kind: 'done', code: 'none' });
    expect(await queued()).toEqual([]);
  });

  it('skips a key the ledger already holds, and moves on to the next prompt', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const id = await approved(author, { startDate: '2026-11-11' });
    world.clock.set(at('2026-11-14'));
    await inLedger(author, id, `report.prompt:${id}:1`);
    expect(await run()).toEqual({ kind: 'done', code: 'none' });
    expect(await queued()).toEqual([]);

    // the first prompt went out; the second is a new key
    world.clock.set(at('2026-11-19'));
    await run();
    expect(await keys()).toEqual([`report.prompt:${id}:2`]);
  });

  it('asks nothing once both prompts are in the ledger', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const id = await approved(author, { startDate: '2026-11-11' });
    world.clock.set(at('2026-11-25'));
    await inLedger(author, id, `report.prompt:${id}:1`);
    await inLedger(author, id, `report.prompt:${id}:2`);
    await run();
    expect(await queued()).toEqual([]);
  });

  it('sends one mail, not two, for an akce found late', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    await approved(author, { startDate: '2026-11-11' });
    world.clock.set(at('2026-11-25'));
    await run();
    expect(await queued()).toHaveLength(1);
  });

  it('asks each author about their own akce', async () => {
    const [one, other] = [
      await world.seed.user({ role: 'submitter' }),
      await world.seed.user({ role: 'submitter' }),
    ];
    const first = await approved(one, { startDate: '2026-11-10' });
    const second = await approved(other, { startDate: '2026-11-11' });
    world.clock.set(at('2026-11-12'));
    await run();
    const jobs = await queued();
    expect(
      jobs.map((q) => [q.key, (q.data as { recipientId: string }).recipientId]).sort(),
    ).toEqual(
      [
        [`report.prompt:${first}:1`, one.id],
        [`report.prompt:${second}:1`, other.id],
      ].sort(),
    );
  });

  it('leaves out an akce that expects no report, and one whose report is written or declined', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const wanted = await approved(author, { startDate: '2026-11-11' });
    await approved(author, { startDate: '2026-11-11' }, { expectsReport: false });
    const written = await approved(author, { startDate: '2026-11-11' });
    await patch(author, written, { reportState: 'written' });
    const declined = await approved(author, { startDate: '2026-11-11' });
    await patch(author, declined, { reportState: 'declined' });
    const cancelled = await approved(author, { startDate: '2026-11-11' });
    await patch(author, cancelled, { state: 'cancelled' });
    world.clock.set(at('2026-11-12'));
    await run();
    expect(await keys()).toEqual([`report.prompt:${wanted}:1`]);
  });
});

describe("the prompt after the mail at an akce's end (ADR 0035 item 7)", () => {
  const sentEnded = (recipient: UserRecord, itemId: string) =>
    world.workerDb.transaction(
      { principal: system('job:test'), now: world.clock.now(), requestId: 'seed' },
      { mode: 'write' },
      (tx) =>
        tx.mailLedger.skip({
          dedupeKey: `report.ended:${itemId}`,
          template: 'report.ended',
          recipientId: recipient.id,
          subjectId: itemId,
          code: 'skipped.stale',
        }),
    );

  it('skips prompt 1 when report.ended is in the ledger, and keeps prompt 2', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const id = await approved(author, { startDate: '2026-11-11' });
    await sentEnded(author, id);
    world.clock.set(at('2026-11-12'));
    expect(await run()).toEqual({ kind: 'done', code: 'none' });
    expect(await queued()).toEqual([]);

    world.clock.set(at('2026-11-19'));
    expect(await run()).toEqual({ kind: 'done', code: 'prompted' });
    expect(await keys()).toEqual([`report.prompt:${id}:2`]);
  });

  it('still sends prompt 1 for an akce whose end mail was never written, and only that one skips', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const mailed = await approved(author, { startDate: '2026-11-11' });
    const other = await approved(author, { startDate: '2026-11-11' });
    await sentEnded(author, mailed);
    world.clock.set(at('2026-11-12'));
    await run();
    expect(await keys()).toEqual([`report.prompt:${other}:1`]);
  });
});
