import { describe, expect, it } from 'vitest';

import type { JobOutcome } from '@/application/ports';

import { logLineFor } from './index';

type Kind = JobOutcome['kind'];

describe('the log line of an outcome', () => {
  it.each<[Kind, string, string, string]>([
    ['done', 'sent', 'mail.sent', 'info'],
    ['done', 'resent', 'mail.resend_unknown_outcome', 'warn'],
    ['done', 'skipped.stale', 'mail.skipped', 'info'],
    ['done', 'skipped.recipient-gone', 'mail.skipped', 'info'],
    ['done', 'already.sent', 'mail.skipped', 'info'],
    ['done', 'purged', 'job.done', 'info'],
    ['wait', 'wait.gate', 'mail.waiting', 'debug'],
    ['wait', 'wait.window', 'mail.waiting', 'debug'],
    ['retry', 'unknown.timeout', 'mail.unknown', 'warn'],
    ['retry', 'net.ENOTFOUND', 'mail.deferred', 'warn'],
    ['retry', 'net.unavailable', 'mail.deferred', 'warn'],
    ['retry', 'deferred', 'mail.deferred', 'warn'],
    ['retry', 'shutdown', 'job.retry', 'warn'],
    ['retry', 'error.DatabaseFailure', 'job.retry', 'warn'],
    ['dead', 'rejected.400', 'job.dead', 'error'],
    ['dead', 'ambiguous', 'job.dead', 'error'],
  ])('%s %s → %s at %s', (kind, code, name, level) => {
    expect(logLineFor({ kind, code })).toEqual({ name, level });
  });

  it.each(['auth.403', 'auth.401', 'auth.AADSTS700027'])(
    'calls %s systemic and points IT at the Exchange scope',
    (code) => {
      expect(logLineFor({ kind: 'retry', code })).toEqual({
        name: 'mail.systemic',
        level: 'warn',
        hint: 'check Exchange RBAC scope (docs/ENTRA-SETUP.md §3); access can take up to 2 h to propagate',
      });
    },
  );

  it('does not mistake a prefix for a longer word', () => {
    expect(logLineFor({ kind: 'done', code: 'sentinel' })).toEqual({
      name: 'job.done',
      level: 'info',
    });
    expect(logLineFor({ kind: 'retry', code: 'authority.x' })).toEqual({
      name: 'job.retry',
      level: 'warn',
    });
  });
});
