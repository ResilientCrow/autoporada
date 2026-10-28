import { describe, expect, it } from 'vitest';

import { REVIEW_DECISIONS } from '@/domain/review';

import { mailJob, POINT_MAIL } from './index';

const AUTHOR = '0b6f2c1e-6f1a-4c7e-9d4b-2a1f3e5c7d90';
const EVENT = '01939f2e-7c1a-7d4e-9b3f-5a6c7d8e9f01';
const LATER = '01939f2e-7c1a-7d4e-9b3f-5a6c7d8e9f02';

describe('point mails', () => {
  it('maps each review decision to the author’s mail', () => {
    expect(POINT_MAIL).toEqual({
      approve: 'point.approved',
      return: 'point.returned',
      reject: 'point.rejected',
    });
    expect(Object.keys(POINT_MAIL).sort()).toEqual([...REVIEW_DECISIONS].sort());
  });

  it.each(['point.returned', 'point.approved', 'point.rejected'] as const)(
    'mails %s to the author about the event, keyed by the event',
    (template) => {
      expect(mailJob(template, { authorId: AUTHOR, eventId: EVENT })).toEqual({
        data: { template, recipientId: AUTHOR, subjectId: EVENT },
        dedupeKey: `${template}:${EVENT}`,
      });
    },
  );

  it('gives a second return of the same point its own mail', () => {
    const first = mailJob(POINT_MAIL.return, { authorId: AUTHOR, eventId: EVENT });
    const second = mailJob(POINT_MAIL.return, { authorId: AUTHOR, eventId: LATER });
    expect(second.dedupeKey).not.toBe(first.dedupeKey);
    expect(second.dedupeKey.length).toBeLessThanOrEqual(120);
  });
});
