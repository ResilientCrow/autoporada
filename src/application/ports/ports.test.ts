import { describe, expect, expectTypeOf, it } from 'vitest';

import { readScope } from '@/domain/policy';

import { AUDIT_EXEMPTIONS, scopeOf, system, type JobPort, type UserPrincipal } from './index';

describe('ports', () => {
  it('keep the list of unaudited writes closed', () => {
    expect(AUDIT_EXEMPTIONS).toEqual(['author-autosave', 'retention']);
  });

  it('type job payloads by job name', () => {
    expectTypeOf<Parameters<JobPort['enqueue']>[0]>().toEqualTypeOf<'mail.send' | 'pdf.render'>();
    const jobs: JobPort = { enqueue: () => Promise.resolve() };
    // @ts-expect-error: pdf.render takes a document id, not a recipient
    void jobs.enqueue('pdf.render', { recipientId: 'x' });
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
