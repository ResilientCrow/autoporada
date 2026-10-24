import { describe, expect, it, vi } from 'vitest';

import {
  JOBS_REDRIVE_USAGE,
  JOBS_STATUS_USAGE,
  jobsRedrive,
  jobsStatus,
  type DeadJob,
  type JobsAdmin,
} from './jobs';

const ID = '0e5d3a4c-6b2f-4c1e-9a77-3f0d8b1c2a64';
const ID_2 = '1f6e4b5d-7c30-4d2f-8b88-4a1e9c2d3b75';

const dead = (overrides: Partial<DeadJob> = {}): DeadJob => ({
  id: ID,
  sourceQueue: 'mail.send',
  template: 'access.approved',
  dedupeKey: 'access.approved:r-1',
  createdAt: new Date('2026-10-24T10:00:00.000Z'),
  code: 'rejected.400',
  ...overrides,
});

function fakeAdmin(
  parts: {
    counts?: Awaited<ReturnType<JobsAdmin['counts']>>;
    dead?: DeadJob[];
    moved?: number;
  } = {},
) {
  const redrive = vi.fn(() => Promise.resolve(parts.moved ?? 0));
  const admin: JobsAdmin = {
    counts: () => Promise.resolve(parts.counts ?? []),
    deadJobs: () => Promise.resolve(parts.dead ?? []),
    redrive,
  };
  return { admin, redrive };
}

describe('jobs:status', () => {
  it('prints dead: 0 and nothing else when nothing is waiting', async () => {
    const { admin } = fakeAdmin();
    expect(await jobsStatus(admin, [])).toEqual(['dead: 0']);
  });

  it('prints the non-zero states of each queue in a fixed order, and says when a queue is empty', async () => {
    const { admin } = fakeAdmin({
      counts: [
        { queue: 'mail.send', states: { completed: 12, failed: 1, created: 2, retry: 0 } },
        { queue: 'mail.prune', states: {} },
        { queue: 'dead', states: { created: 1 } },
      ],
      dead: [dead()],
    });
    const lines = await jobsStatus(admin, []);
    expect(lines.slice(0, 2)).toEqual([
      'mail.prune: no jobs',
      'mail.send: 2 created, 12 completed, 1 failed',
    ]);
  });

  it('lists each dead job with id, source queue, template, key, creation and code, and no more', async () => {
    const { admin } = fakeAdmin({
      dead: [
        dead(),
        dead({ id: ID_2, sourceQueue: null, template: null, dedupeKey: null, code: null }),
      ],
    });
    expect(await jobsStatus(admin, [])).toEqual([
      'dead: 2',
      `  ${ID}  mail.send  access.approved  access.approved:r-1  2026-10-24T10:00:00.000Z  rejected.400`,
      `  ${ID_2}  -  -  -  2026-10-24T10:00:00.000Z  -`,
    ]);
  });

  it('takes no arguments', async () => {
    await expect(jobsStatus(fakeAdmin().admin, ['--all'])).rejects.toThrow(JOBS_STATUS_USAGE);
  });
});

describe('jobs:redrive', () => {
  it('moves the named jobs by id, one flag with several ids or repeated', async () => {
    const { admin, redrive } = fakeAdmin({ moved: 2 });
    expect(await jobsRedrive(admin, ['--id', ID, ID_2])).toEqual(['Redrove 2 jobs.']);
    expect(redrive).toHaveBeenLastCalledWith({ ids: [ID, ID_2] });
    await jobsRedrive(admin, ['--id', ID, '--id', ID_2]);
    expect(redrive).toHaveBeenLastCalledWith({ ids: [ID, ID_2] });
  });

  it('moves everything that came from one source queue', async () => {
    const { admin, redrive } = fakeAdmin({ moved: 1 });
    expect(await jobsRedrive(admin, ['--source', 'mail.send'])).toEqual(['Redrove 1 job.']);
    expect(redrive).toHaveBeenCalledWith({ source: 'mail.send' });
  });

  it('can narrow a source to some ids', async () => {
    const { admin, redrive } = fakeAdmin();
    expect(await jobsRedrive(admin, ['--source', 'mail.send', '--id', ID])).toEqual([
      'Redrove 0 jobs.',
    ]);
    expect(redrive).toHaveBeenCalledWith({ source: 'mail.send', ids: [ID] });
  });

  it.each([
    ['no selector', []],
    ['an unknown flag', ['--all']],
    ['an unknown flag beside a selector', ['--source', 'mail.send', '--force']],
    ['a stray word', ['mail.send']],
    ['--id without a value', ['--id']],
    ['--id followed by a flag', ['--id', '--source', 'mail.send']],
    ['--source without a value', ['--source']],
    ['--source twice', ['--source', 'mail.send', '--source', 'mail.prune']],
    ['an id that is not a UUID', ['--id', 'not-an-id']],
  ])('refuses %s and moves nothing', async (_why, args) => {
    const { admin, redrive } = fakeAdmin();
    await expect(jobsRedrive(admin, args)).rejects.toThrow(JOBS_REDRIVE_USAGE);
    expect(redrive).not.toHaveBeenCalled();
  });
});
