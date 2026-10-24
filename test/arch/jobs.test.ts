import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { JOB_HANDLERS, SCHEDULES } from '@/application/jobs';
import { JOB_NAMES } from '@/application/ports';
import { QUEUES } from '@/infra/jobs';
import { RETRY_AFTER_MAX_MS } from '@/infra/mail';
import { HOLD_MS } from '@/infra/worker';

const JOBS_DIR = join(process.cwd(), 'src/application/jobs');
/** Time and chance reach a handler only through its deps, so tests can drive them. */
const AMBIENT = /Date\.now|new Date\(\s*\)|Math\.random/;

describe('the job inventory (ADR 0015)', () => {
  it('gives every job a handler and a queue, and nothing else one', () => {
    expect(Object.keys(JOB_HANDLERS).sort()).toEqual([...JOB_NAMES].sort());
    expect(QUEUES.map((q) => q.name).sort()).toEqual([...JOB_NAMES, 'dead'].sort());
  });

  it('schedules only jobs that exist', () => {
    for (const { job } of SCHEDULES) expect(JOB_NAMES).toContain(job);
  });

  it('keeps the clock and randomness out of the handlers', () => {
    const files = readdirSync(JOBS_DIR).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
    expect(files.length).toBeGreaterThan(0);
    const offenders = files.filter((f) => AMBIENT.test(readFileSync(join(JOBS_DIR, f), 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('holds as long as the longest Retry-After it honours, so one wait never burns a retry', () => {
    expect(RETRY_AFTER_MAX_MS).toBe(HOLD_MS);
  });
});
