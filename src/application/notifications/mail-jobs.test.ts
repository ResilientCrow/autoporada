import { describe, expect, it } from 'vitest';

import { calDate } from '@/domain/time';
import { TEMPLATE_NAMES } from '@/notify';

import { DECISION_MAIL, mailJob } from './index';

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

  it('keys a report prompt by the akce and its stage, so each stage is mailed once', () => {
    const first = mailJob('report.prompt', { authorId: USER, itemId: REQUEST, stage: 1 });
    const second = mailJob('report.prompt', { authorId: USER, itemId: REQUEST, stage: 2 });
    expect(first).toEqual({
      data: { template: 'report.prompt', recipientId: USER, subjectId: REQUEST },
      dedupeKey: `report.prompt:${REQUEST}:1`,
    });
    expect(second.dedupeKey).toBe(`report.prompt:${REQUEST}:2`);
  });

  it('keys a reminder by kind, Monday and person, so each person is mailed once per kind and week', () => {
    const monday = calDate(2026, 10, 26);
    const soft = mailJob('reminder.soft', { userId: USER, monday });
    expect(soft).toEqual({
      data: { template: 'reminder.soft', recipientId: USER, subjectId: USER },
      dedupeKey: `reminder.soft:2026-10-26:${USER}`,
    });
    const hard = mailJob('reminder.hard', { userId: USER, monday });
    expect(hard.dedupeKey).toBe(`reminder.hard:2026-10-26:${USER}`);
    expect(
      mailJob('reminder.soft', { userId: USER, monday: calDate(2026, 11, 2) }).dedupeKey,
    ).not.toBe(soft.dedupeKey);
  });

  it('keys a digest by person, Prague day and slot, so each slot mails a person once', () => {
    const date = calDate(2026, 10, 26);
    const morning = mailJob('reviewer.digest', { userId: USER, date, slot: '07' });
    expect(morning).toEqual({
      data: { template: 'reviewer.digest', recipientId: USER, subjectId: USER },
      dedupeKey: `reviewer.digest:${USER}:2026-10-26:07`,
    });
    expect(mailJob('reviewer.digest', { userId: USER, date, slot: '15' }).dedupeKey).toBe(
      `reviewer.digest:${USER}:2026-10-26:15`,
    );
    expect(
      mailJob('reviewer.digest', { userId: USER, date: calDate(2026, 10, 27), slot: '07' })
        .dedupeKey,
    ).not.toBe(morning.dedupeKey);
  });

  it('keys a summary by person and meeting Monday, so each headmaster is told once per issue', () => {
    const monday = calDate(2026, 10, 26);
    const first = mailJob('headmaster.summary', { userId: USER, monday });
    expect(first).toEqual({
      data: { template: 'headmaster.summary', recipientId: USER, subjectId: USER },
      dedupeKey: `headmaster.summary:${USER}:2026-10-26`,
    });
    expect(
      mailJob('headmaster.summary', { userId: USER, monday: calDate(2026, 11, 2) }).dedupeKey,
    ).not.toBe(first.dedupeKey);
  });

  it('builds payloads of ids only and keys that start with their template, for every template', () => {
    const jobs = [
      mailJob('access.approved', { recipientId: USER, requestId: REQUEST }),
      mailJob('access.rejected', { recipientId: USER, requestId: REQUEST }),
      mailJob('access.blocked', { recipientId: USER, requestId: REQUEST }),
      mailJob('access.granted', { userId: USER, versionAfter: 2 }),
      mailJob('mail.check', { recipientId: USER, checkId: CHECK }),
      mailJob('point.returned', { authorId: USER, eventId: REQUEST }),
      mailJob('point.approved', { authorId: USER, eventId: REQUEST }),
      mailJob('point.rejected', { authorId: USER, eventId: REQUEST }),
      mailJob('report.prompt', { authorId: USER, itemId: REQUEST, stage: 1 }),
      mailJob('reminder.soft', { userId: USER, monday: calDate(2026, 10, 26) }),
      mailJob('reminder.hard', { userId: USER, monday: calDate(2026, 10, 26) }),
      mailJob('reviewer.digest', { userId: USER, date: calDate(2026, 10, 26), slot: '15' }),
      mailJob('headmaster.summary', { userId: USER, monday: calDate(2026, 10, 26) }),
      mailJob('issue.moved', {
        userId: USER,
        monday: calDate(2026, 10, 26),
        deadlineAt: new Date('2026-11-23T19:00:00Z'),
      }),
      mailJob('report.ended', { authorId: USER, itemId: REQUEST }),
      mailJob('report.last-call', {
        authorId: USER,
        kind: 'akce',
        id: REQUEST,
        monday: calDate(2026, 10, 26),
      }),
      mailJob('headmaster.late-summary', { userId: USER, monday: calDate(2026, 10, 26) }),
    ];
    expect(jobs.map((job) => job.data.template)).toEqual(TEMPLATE_NAMES);
    for (const { data, dedupeKey } of jobs) {
      expect(Object.keys(data).sort()).toEqual(['recipientId', 'subjectId', 'template']);
      expect(dedupeKey.startsWith(`${data.template}:`)).toBe(true);
      expect(dedupeKey.length).toBeLessThanOrEqual(120);
    }
  });
});
