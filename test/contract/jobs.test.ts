import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { defineSystemUseCase, fail, ok } from '@/application/core';
import { system, TxClosed, type Tx } from '@/application/ports';

import { setupWorld } from '../support/world';

const world = setupWorld();
const cli = system('cli:test');

const mail = (recipientId: string) =>
  ({ template: 'access.approved', recipientId, subjectId: recipientId }) as const;

describe('JobPort (port contract)', () => {
  it('shows a committed job once, with its payload and key', async () => {
    const user = await world.seed.user();
    await world.tx(cli, (tx) =>
      tx.jobs.enqueue('mail.send', mail(user.id), { dedupeKey: 'access.approved:1' }),
    );
    expect(await world.inspect.jobs()).toEqual([
      { name: 'mail.send', data: mail(user.id), options: { dedupeKey: 'access.approved:1' } },
    ]);
  });

  it('drops a job when the transaction rolls back', async () => {
    const user = await world.seed.user();
    const failing = world.tx(cli, async (tx) => {
      await tx.jobs.enqueue('mail.send', mail(user.id), { dedupeKey: 'rolled-back' });
      throw new Error('work failed');
    });
    await expect(failing).rejects.toThrow('work failed');
    expect(await world.inspect.jobs()).toEqual([]);
  });

  it('keeps one job for the same key, in one transaction and across transactions', async () => {
    const user = await world.seed.user();
    await world.tx(cli, async (tx) => {
      await tx.jobs.enqueue('mail.send', mail(user.id), { dedupeKey: 'same' });
      await tx.jobs.enqueue('mail.send', mail(user.id), { dedupeKey: 'same' });
    });
    await world.tx(cli, (tx) => tx.jobs.enqueue('mail.send', mail(user.id), { dedupeKey: 'same' }));
    expect(await world.inspect.jobs()).toHaveLength(1);
  });

  it('keeps two jobs for two keys', async () => {
    const user = await world.seed.user();
    await world.tx(cli, async (tx) => {
      await tx.jobs.enqueue('mail.send', mail(user.id), { dedupeKey: 'one' });
      await tx.jobs.enqueue('mail.send', mail(user.id), { dedupeKey: 'two' });
    });
    const keys = (await world.inspect.jobs()).map((job) => job.options.dedupeKey);
    expect(keys.sort()).toEqual(['one', 'two']);
  });

  it('keeps the start time it was given', async () => {
    const user = await world.seed.user();
    const startAfter = new Date(Date.now() + 90 * 60_000);
    await world.tx(cli, (tx) =>
      tx.jobs.enqueue('mail.send', mail(user.id), { dedupeKey: 'later', startAfter }),
    );
    expect(await world.inspect.jobs()).toEqual([
      { name: 'mail.send', data: mail(user.id), options: { dedupeKey: 'later', startAfter } },
    ]);
  });

  it('refuses a leaked port once the transaction has ended', async () => {
    const user = await world.seed.user();
    let leaked: Tx | undefined;
    await world.tx(cli, async (tx) => {
      leaked = tx;
    });
    await expect(async () =>
      leaked!.jobs.enqueue('mail.send', mail(user.id), { dedupeKey: 'leak' }),
    ).rejects.toBeInstanceOf(TxClosed);
    expect(await world.inspect.jobs()).toEqual([]);
  });

  it('leaves no job behind when the use case returns a failure', async () => {
    const user = await world.seed.user();
    const refusing = defineSystemUseCase({
      name: 'test.refuse',
      reasons: ['cli:test'],
      mode: 'write',
      input: z.strictObject({}),
      output: z.object({}),
      async execute({ tx }) {
        await tx.jobs.enqueue('mail.send', mail(user.id), { dedupeKey: 'refused' });
        return fail({ code: 'rule', rule: 'last-headmaster' });
      },
    });
    const result = await world.run(refusing, cli, {});
    expect(result.ok).toBe(false);
    expect(await world.inspect.jobs()).toEqual([]);

    const accepting = defineSystemUseCase({
      name: 'test.accept',
      reasons: ['cli:test'],
      mode: 'write',
      input: z.strictObject({}),
      output: z.object({}),
      async execute({ tx }) {
        await tx.jobs.enqueue('mail.send', mail(user.id), { dedupeKey: 'accepted' });
        return ok({});
      },
    });
    expect((await world.run(accepting, cli, {})).ok).toBe(true);
    expect(await world.inspect.jobs()).toHaveLength(1);
  });
});
