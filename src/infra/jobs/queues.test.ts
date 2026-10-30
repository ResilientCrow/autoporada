import { describe, expect, it } from 'vitest';

import { JOB_NAMES } from '@/application/ports';

import { QUEUE_SPECS, QUEUES } from './index';

const DAY = 86_400;
const HOUR = 3_600;

const spec = (name: string) => {
  const found = QUEUES.find((queue) => queue.name === name);
  if (!found) throw new Error(`no queue ${name}`);
  return found;
};

/**
 * The shortest wait pg-boss can schedule before retry `n` (counting from 0): its backoff is
 * delay * 2^n * (1 + random), capped at retryDelayMax (plans.js, the failure SQL).
 */
function shortestWait(retry: number, delay: number, cap: number): number {
  return Math.min(cap, delay * 2 ** Math.min(16, retry));
}

describe('QUEUES', () => {
  it('holds one queue per job name and the dead-letter queue', () => {
    expect(QUEUES.map((queue) => queue.name).sort()).toEqual(['dead', ...[...JOB_NAMES].sort()]);
  });

  it('lists the keyed specs, the dead-letter queue first, each under its own name', () => {
    expect(QUEUES.map((queue) => queue.name)).toEqual(['dead', ...JOB_NAMES]);
    for (const queue of QUEUES) {
      expect(queue).toEqual({ name: queue.name, ...QUEUE_SPECS[queue.name] });
    }
  });

  it('retries mail.prune 3 times from 5 min up to an hour, well inside its 2 days', () => {
    expect(spec('mail.prune')).toEqual({
      name: 'mail.prune',
      policy: 'standard',
      options: {
        retryLimit: 3,
        retryDelay: 300,
        retryBackoff: true,
        retryDelayMax: 3600,
        expireInSeconds: 600,
        retentionSeconds: 2 * DAY,
        deleteAfterSeconds: 2 * DAY,
        deadLetter: 'dead',
      },
    });
  });

  it('retries future.report-prompt 3 times from 5 min up to an hour, well inside its 2 days', () => {
    expect(spec('future.report-prompt')).toEqual({
      name: 'future.report-prompt',
      policy: 'standard',
      options: {
        retryLimit: 3,
        retryDelay: 300,
        retryBackoff: true,
        retryDelayMax: 3600,
        expireInSeconds: 600,
        retentionSeconds: 2 * DAY,
        deleteAfterSeconds: 2 * DAY,
        deadLetter: 'dead',
      },
    });
  });

  it('retries reminders.deadline twice within ten minutes, since the next tick comes after 15', () => {
    expect(spec('reminders.deadline')).toEqual({
      name: 'reminders.deadline',
      policy: 'standard',
      options: {
        retryLimit: 2,
        retryDelay: 60,
        retryBackoff: true,
        retryDelayMax: 600,
        expireInSeconds: 300,
        retentionSeconds: 2 * DAY,
        deleteAfterSeconds: 2 * DAY,
        deadLetter: 'dead',
      },
    });
    const { retryLimit, retryDelay, retryDelayMax } = spec('reminders.deadline').options;
    let total = 0;
    for (let retry = 0; retry < retryLimit!; retry++) {
      total += shortestWait(retry, retryDelay!, retryDelayMax!);
    }
    expect(total).toBeLessThan(15 * 60);
  });

  it('creates the dead-letter queue before any queue that names it', () => {
    const names = QUEUES.map((queue) => queue.name);
    for (const queue of QUEUES) {
      const target = queue.options.deadLetter;
      if (target) expect(names.indexOf(target)).toBeLessThan(names.indexOf(queue.name));
    }
  });

  it('retries mail.send 15 times with backoff from 30 s up to 15 min', () => {
    expect(spec('mail.send')).toEqual({
      name: 'mail.send',
      policy: 'standard',
      options: {
        retryLimit: 15,
        retryDelay: 30,
        retryBackoff: true,
        retryDelayMax: 900,
        // longer than the 900 s hold of a Retry-After, with 5 min to spare
        expireInSeconds: 1200,
        retentionSeconds: 14 * DAY,
        deleteAfterSeconds: 2 * DAY,
        deadLetter: 'dead',
      },
    });
  });

  it('keeps failed jobs 90 days and never retries them', () => {
    expect(spec('dead')).toEqual({
      name: 'dead',
      policy: 'standard',
      options: {
        retryLimit: 0,
        expireInSeconds: 300,
        retentionSeconds: 90 * DAY,
        deleteAfterSeconds: 90 * DAY,
      },
    });
  });

  it('outlasts an RBAC propagation of two hours before a mail goes to the dead-letter queue', () => {
    const { retryLimit = 0, retryDelay = 0, retryDelayMax = 0 } = spec('mail.send').options;
    let total = 0;
    for (let retry = 0; retry < retryLimit; retry += 1) {
      total += shortestWait(retry, retryDelay, retryDelayMax);
    }
    // 30 + 60 + 120 + 240 + 480 + 10 x 900
    expect(total).toBe(9_930);
    expect(total).toBeGreaterThanOrEqual(2.5 * HOUR);
  });

  it('deletes every finished job eventually, and keeps dead ones longer than mail.send waits to run', () => {
    for (const { options } of QUEUES) {
      expect(options.deleteAfterSeconds).toBeGreaterThan(0);
      expect(options.retentionSeconds).toBeGreaterThan(0);
    }
    expect(spec('dead').options.deleteAfterSeconds).toBeGreaterThan(
      spec('mail.send').options.retentionSeconds ?? 0,
    );
  });
});
