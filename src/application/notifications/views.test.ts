import { describe, expect, it } from 'vitest';

import type { AccessRequestRecord, UserRecord } from '@/application/ports';
import { calDate, instantToWallClock } from '@/domain/time';
import { cooldownEnd } from '@/domain/review';

import { viewOf } from './index';

const CREATED = new Date('2026-03-02T09:00:00Z');
const DECIDED = new Date('2026-03-10T09:00:00Z');

const request = (decidedAt: Date | null): AccessRequestRecord => ({
  id: 'request',
  userId: 'user',
  reason: 'reason',
  state: 'rejected',
  decidedBy: 'head',
  decidedAt,
  version: 2,
  createdAt: CREATED,
});

const USER = { id: 'user' } as UserRecord;

describe('viewOf', () => {
  it('gives a rejection the day its cooldown ends, counted from the decision', () => {
    expect(viewOf('access.rejected', request(DECIDED))).toEqual({
      retryFrom: instantToWallClock(cooldownEnd(DECIDED)).date,
    });
  });

  it('counts from the request when it has no decision time', () => {
    expect(viewOf('access.rejected', request(null))).toEqual({
      retryFrom: instantToWallClock(cooldownEnd(CREATED)).date,
    });
  });

  it('tells a reminder the meeting it is about', () => {
    const monday = calDate(2026, 10, 26);
    for (const template of ['reminder.soft', 'reminder.hard'] as const) {
      expect(viewOf(template, { monday, hasWork: true })).toEqual({ meetingDate: monday });
    }
  });

  it('tells a digest the counts it was loaded with', () => {
    expect(viewOf('reviewer.digest', { submitted: 4, accessRequests: 2 })).toEqual({
      submitted: 4,
      accessRequests: 2,
    });
  });

  it('gives every other template no variables', () => {
    expect(viewOf('access.approved', request(DECIDED))).toEqual({});
    expect(viewOf('access.blocked', request(DECIDED))).toEqual({});
    expect(viewOf('access.granted', USER)).toEqual({});
    expect(viewOf('mail.check', USER)).toEqual({});
    expect(
      viewOf('report.prompt', {
        id: 'item',
        authorId: 'user',
        state: 'approved',
        reportState: 'none',
      }),
    ).toEqual({});
    const decision = {
      event: { id: 'event', pointId: 'point', event: 'return', toState: 'returned' },
      point: { id: 'point', authorId: 'user', state: 'returned' },
    } as const;
    for (const template of ['point.returned', 'point.approved', 'point.rejected'] as const) {
      expect(viewOf(template, decision)).toEqual({});
    }
  });
});
