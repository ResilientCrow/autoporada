import { describe, expect, expectTypeOf, it } from 'vitest';

import { readScope } from '@/domain/policy';
import type { TemplateName } from '@/notify';

import {
  AUDIT_EXEMPTIONS,
  GRAPH_REQUEST_ID,
  isOutcomeCode,
  JOB_NAMES,
  scopeOf,
  system,
  type DoneDetail,
  type JobCatalog,
  type JobHandlers,
  type JobName,
  type JobOutcome,
  type JobPort,
  type MailPort,
  type MailResult,
  type UserPrincipal,
  type WorkerDeps,
} from './index';

describe('ports', () => {
  it('keep the list of unaudited writes closed', () => {
    expect(AUDIT_EXEMPTIONS).toEqual(['author-autosave', 'retention', 'session-touch']);
  });

  it('lists the job names the worker knows', () => {
    expect(JOB_NAMES).toEqual([
      'mail.send',
      'mail.prune',
      'future.report-prompt',
      'reminders.deadline',
      'reviewer.digest',
      'headmaster.summary',
      'issues.moved-notice',
    ]);
    expectTypeOf<JobName>().toEqualTypeOf<
      | 'mail.send'
      | 'mail.prune'
      | 'future.report-prompt'
      | 'reminders.deadline'
      | 'reviewer.digest'
      | 'headmaster.summary'
      | 'issues.moved-notice'
    >();
  });

  it('type job payloads by job name, and require a dedupe key', () => {
    expectTypeOf<Parameters<JobPort['enqueue']>[0]>().toEqualTypeOf<JobName>();
    expectTypeOf<JobCatalog['mail.send']['template']>().toEqualTypeOf<TemplateName>();
    const jobs: JobPort = { enqueue: () => Promise.resolve() };
    const mail = { template: 'access.approved', recipientId: 'u1', subjectId: 'r1' } as const;
    void jobs.enqueue('mail.send', mail, { dedupeKey: 'access.approved:r1' });
    // @ts-expect-error: every job must be safely repeatable, so the key is required
    void jobs.enqueue('mail.send', mail);
    // @ts-expect-error: an empty options object has no key either
    void jobs.enqueue('mail.send', mail, {});
    // @ts-expect-error: the template is one of the notify templates
    void jobs.enqueue('mail.send', { ...mail, template: 'nope' }, { dedupeKey: 'k' });
    // @ts-expect-error: pdf.render is not in the catalogue until M10
    void jobs.enqueue('pdf.render', { documentId: 'd1' }, { dedupeKey: 'k' });
  });

  it('give a handler a typed job and an outcome with a code', () => {
    expectTypeOf<JobOutcome['kind']>().toEqualTypeOf<'done' | 'wait' | 'retry' | 'dead'>();
    expectTypeOf<keyof JobHandlers>().toEqualTypeOf<JobName>();
    const handlers: Pick<JobHandlers, 'mail.send'> = {
      'mail.send': (deps: WorkerDeps, job) => {
        expectTypeOf(job.data).toEqualTypeOf<JobCatalog['mail.send']>();
        return Promise.resolve({ kind: 'done', code: deps.appOrigin });
      },
    };
    expect(Object.keys(handlers)).toEqual(['mail.send']);
  });

  it('lets only a done outcome carry a closed detail', () => {
    expectTypeOf<DoneDetail>().toEqualTypeOf<{
      readonly graphRequestId: string | null;
      readonly ms: number;
    }>();
    type Done = Extract<JobOutcome, { kind: 'done' }>;
    expectTypeOf<Done['detail']>().toEqualTypeOf<DoneDetail | undefined>();
    expectTypeOf<Extract<JobOutcome, { kind: 'retry' | 'dead' | 'wait' }>>().not.toHaveProperty(
      'detail',
    );
    expect(GRAPH_REQUEST_ID.test('a1b2c3d4-0000-4e5f-8a9b-1c2d3e4f5a6b')).toBe(true);
    expect(GRAPH_REQUEST_ID.test('jana@ssps.cz')).toBe(false);
  });

  it('classify what a mail transport answers', () => {
    expectTypeOf<MailResult['kind']>().toEqualTypeOf<
      'sent' | 'throttled' | 'not-sent' | 'unknown' | 'auth' | 'rejected'
    >();
    expectTypeOf<MailPort['send']>().returns.resolves.toEqualTypeOf<MailResult>();
  });

  it.each([
    'sent',
    'skipped.stale',
    'already.sent',
    'wait.gate',
    'deferred',
    'auth.403',
    'net.ECONNRESET',
  ])('accepts the outcome code %s', (code) => {
    expect(isOutcomeCode(code)).toBe(true);
  });

  it.each([
    '',
    'Sent',
    'sent.',
    '.sent',
    'sent..x',
    'jana@example.cz',
    'user 12 not found',
    'sent\nretry',
    'a'.repeat(41),
  ])('refuses the outcome code %j (no free text reaches the queue)', (code) => {
    expect(isOutcomeCode(code)).toBe(false);
  });

  it('let the system see everything and users their policy scope', () => {
    expect(scopeOf(system('job:pdf.render'), 'point')).toEqual({ kind: 'all' });
    const user: UserPrincipal = {
      kind: 'user',
      actor: { id: 'u1', role: 'submitter', status: 'active', isStudent: true },
      sessionId: 's1',
      authTime: new Date(0),
    };
    expect(scopeOf(user, 'point')).toEqual(readScope(user.actor, 'point'));
  });
});
