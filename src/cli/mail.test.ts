import { describe, expect, it } from 'vitest';

import { setupWorld } from '../../test/support/world';
import { MAIL_TEST_USAGE, mailTest } from './mail';

const world = setupWorld();
const CHECK_ID = '0190f6a0-0000-4000-8000-00000000c0de';

const run = (args: readonly string[]) =>
  mailTest({ db: world.deps.db, clock: world.clock, newId: () => CHECK_ID }, args);

const reviewer = () =>
  world.seed.user({ role: 'reviewer', status: 'active', email: 'ucitel@ssps.cz' });

describe('mail:test (the operator checks that mail leaves the server)', () => {
  it('queues a mail.check for an active reviewer and records who asked, ids only', async () => {
    const user = await reviewer();
    const lines = await run(['--user', user.id]);

    expect(lines).toEqual([`Test mail queued: mail.check:${CHECK_ID}`]);
    expect(await world.inspect.jobs()).toEqual([
      {
        name: 'mail.send',
        data: { template: 'mail.check', recipientId: user.id, subjectId: user.id },
        options: { dedupeKey: `mail.check:${CHECK_ID}` },
      },
    ]);
    const audit = (await world.inspect.audit()).filter((row) => row.action === 'cli.mail-test');
    expect(audit).toEqual([
      {
        actorId: null,
        action: 'cli.mail-test',
        targetType: 'user',
        targetId: user.id,
        data: { meta: { dedupeKey: `mail.check:${CHECK_ID}` }, system: 'cli:mail-test' },
        requestId: CHECK_ID,
      },
    ]);
  });

  it('also mails an active headmaster', async () => {
    const user = await world.seed.user({ role: 'headmaster', email: 'reditel@ssps.cz' });
    await run(['--user', user.id]);
    expect(await world.inspect.jobs()).toHaveLength(1);
  });

  it.each([
    [
      'a student (the database keeps students below reviewer)',
      { role: 'submitter', tier: 'student' },
    ],
    ['a pending user', { role: 'pending' }],
    ['a submitter', { role: 'submitter' }],
    ['a blocked user', { role: 'reviewer', status: 'blocked' }],
    ['a deactivated user', { role: 'headmaster', status: 'deactivated' }],
  ] as const)(
    'refuses %s, naming the rule and not the person, and writes nothing',
    async (_who, seed) => {
      const user = await world.seed.user({
        ...seed,
        displayName: 'Jana Nováková',
        email: 'jana@ssps.cz',
      });
      const failure = run(['--user', user.id]);
      await expect(failure).rejects.toThrow(/active reviewer or headmaster who is not a student/);
      await failure.catch((error: Error) => {
        expect(error.message).not.toContain('Jana');
        expect(error.message).not.toContain('jana@');
        expect(error.message).not.toContain(user.id);
      });
      expect(await world.inspect.jobs()).toEqual([]);
      expect((await world.inspect.audit()).filter((row) => row.action === 'cli.mail-test')).toEqual(
        [],
      );
    },
  );

  it('refuses a target without an e-mail address', async () => {
    const user = await world.seed.user({ role: 'reviewer', email: null });
    await expect(run(['--user', user.id])).rejects.toThrow(/e-mail address/);
    expect(await world.inspect.jobs()).toEqual([]);
  });

  it('refuses an id nobody has', async () => {
    await expect(run(['--user', '0190f6a0-0000-4000-8000-0000000000aa'])).rejects.toThrow(
      /no user with that id/,
    );
    expect(await world.inspect.jobs()).toEqual([]);
  });

  it.each([
    ['no arguments', []],
    ['--user without a value', ['--user']],
    ['a value that is not a UUID', ['--user', 'jana']],
    ['an unknown flag', ['--user', CHECK_ID, '--all']],
    ['a second --user', ['--user', CHECK_ID, '--user', CHECK_ID]],
  ])('refuses %s with the usage', async (_why, args) => {
    await expect(run(args)).rejects.toThrow(MAIL_TEST_USAGE);
    expect(await world.inspect.jobs()).toEqual([]);
  });
});
