import { describe, expect, it } from 'vitest';

import { TEMPLATE_NAMES } from '@/notify';

import { DECISION_MAIL, mailJob, SUBJECT_REPO } from './index';

const USER = '0b6f2c1e-6f1a-4c7e-9d4b-2a1f3e5c7d90';
const REQUEST = '5d2e8a4b-1c3f-4e6a-8b9d-7f0a1c2e3b4d';
const CHECK = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';

describe('mail jobs', () => {
  it('maps each access decision to its template, and the requester’s cancel to none', () => {
    expect(DECISION_MAIL).toEqual({
      approve: 'access.approved',
      reject: 'access.rejected',
      block: 'access.blocked',
    });
    expect(Object.keys(DECISION_MAIL)).not.toContain('cancel');
  });

  it.each(['access.approved', 'access.rejected', 'access.blocked'] as const)(
    'keys %s by the request and mails the requester about it',
    (template) => {
      expect(mailJob(template, { recipientId: USER, requestId: REQUEST })).toEqual({
        data: { template, recipientId: USER, subjectId: REQUEST },
        dedupeKey: `${template}:${REQUEST}`,
      });
    },
  );

  it('keys a manual grant by the user and the row version it produced', () => {
    expect(mailJob('access.granted', { userId: USER, versionAfter: 4 })).toEqual({
      data: { template: 'access.granted', recipientId: USER, subjectId: USER },
      dedupeKey: `access.granted:${USER}:4`,
    });
    expect(mailJob('access.granted', { userId: USER, versionAfter: 7 }).dedupeKey).toBe(
      `access.granted:${USER}:7`,
    );
  });

  it('keys an operator test mail by the uuid the CLI made', () => {
    expect(mailJob('mail.check', { recipientId: USER, checkId: CHECK })).toEqual({
      data: { template: 'mail.check', recipientId: USER, subjectId: USER },
      dedupeKey: `mail.check:${CHECK}`,
    });
  });

  it('gives a block after a reject its own mail', () => {
    const ids = { recipientId: USER, requestId: REQUEST };
    const rejected = mailJob(DECISION_MAIL.reject, ids);
    const blocked = mailJob(DECISION_MAIL.block, ids);
    expect(rejected.dedupeKey).toBe(`access.rejected:${REQUEST}`);
    expect(blocked.dedupeKey).toBe(`access.blocked:${REQUEST}`);
    expect(blocked.dedupeKey).not.toBe(rejected.dedupeKey);
  });

  it('builds payloads of ids only and keys that start with their template, for every template', () => {
    const jobs = [
      mailJob('access.approved', { recipientId: USER, requestId: REQUEST }),
      mailJob('access.rejected', { recipientId: USER, requestId: REQUEST }),
      mailJob('access.blocked', { recipientId: USER, requestId: REQUEST }),
      mailJob('access.granted', { userId: USER, versionAfter: 2 }),
      mailJob('mail.check', { recipientId: USER, checkId: CHECK }),
    ];
    expect(jobs.map((job) => job.data.template)).toEqual(TEMPLATE_NAMES);
    for (const { data, dedupeKey } of jobs) {
      expect(Object.keys(data).sort()).toEqual(['recipientId', 'subjectId', 'template']);
      expect(dedupeKey.startsWith(`${data.template}:`)).toBe(true);
      expect(dedupeKey.length).toBeLessThanOrEqual(120);
    }
  });

  it('names the repository that holds each template’s subject', () => {
    expect(SUBJECT_REPO).toEqual({
      'access.approved': 'accessRequests',
      'access.rejected': 'accessRequests',
      'access.blocked': 'accessRequests',
      'access.granted': 'users',
      'mail.check': 'users',
    });
  });
});
