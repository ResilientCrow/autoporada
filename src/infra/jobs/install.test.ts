import { describe, expect, it } from 'vitest';

import { waitForBam } from './index';

type Status = 'pending' | 'in_progress' | 'completed' | 'failed';

/** A bam that reports each batch of statuses in turn, then repeats the last one. */
function bam(...batches: Status[][]) {
  let call = 0;
  return {
    calls: () => call,
    getBamStatus: () => {
      const batch = batches[Math.min(call, batches.length - 1)] ?? [];
      call += 1;
      return Promise.resolve(
        batch.map((status) => ({ status, count: 1, lastCreatedOn: new Date(0) })),
      );
    },
  };
}

const fast = { pollMs: 1, timeoutMs: 200 };

describe('waitForBam', () => {
  it('returns at once when nothing is queued', async () => {
    const source = bam([]);
    await waitForBam(source, fast);
    expect(source.calls()).toBe(1);
  });

  it('ignores finished builds', async () => {
    await expect(waitForBam(bam(['completed']), fast)).resolves.toBeUndefined();
  });

  it('polls until pending and running builds are done', async () => {
    const source = bam(['pending'], ['in_progress', 'completed'], ['completed']);
    await waitForBam(source, fast);
    expect(source.calls()).toBe(3);
  });

  it('fails at once, naming the status, when a build failed', async () => {
    const source = bam(['completed', 'failed']);
    await expect(waitForBam(source, fast)).rejects.toThrow(/failed 1/);
    expect(source.calls()).toBe(1);
  });

  it('gives up after the timeout, naming what is still open', async () => {
    await expect(
      waitForBam(bam(['pending', 'in_progress']), { pollMs: 1, timeoutMs: 20 }),
    ).rejects.toThrow(/pending 1, in_progress 1/);
  });
});
