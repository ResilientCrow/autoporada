import { describe, expect, it } from 'vitest';

import {
  newSessionTimes,
  SESSION_ABSOLUTE_MS,
  SESSION_IDLE_MS,
  SESSION_TOUCH_MS,
  sessionVerdict,
  touched,
} from './index';

const start = new Date('2026-10-19T08:00:00Z');
const at = (ms: number) => new Date(start.getTime() + ms);

describe('session lifetimes', () => {
  const times = newSessionTimes(start);

  it('starts with 4 hours idle and 12 hours absolute', () => {
    expect(times).toEqual({
      lastSeenAt: start,
      idleExpiresAt: at(SESSION_IDLE_MS),
      absExpiresAt: at(SESSION_ABSOLUTE_MS),
    });
  });

  it.each([
    [0, 'live'],
    [SESSION_TOUCH_MS - 1, 'live'],
    [SESSION_TOUCH_MS, 'touch'],
    [SESSION_IDLE_MS - 1, 'touch'],
    [SESSION_IDLE_MS, 'expired'],
  ] as const)('is %s ms in: %s', (ms, verdict) => {
    expect(sessionVerdict(times, at(ms))).toBe(verdict);
  });

  it('pushes the idle limit out on a touch, never past the absolute limit', () => {
    expect(touched(times, at(SESSION_TOUCH_MS))).toEqual({
      lastSeenAt: at(SESSION_TOUCH_MS),
      idleExpiresAt: at(SESSION_TOUCH_MS + SESSION_IDLE_MS),
    });
    const late = at(SESSION_ABSOLUTE_MS - 60_000);
    expect(touched(times, late).idleExpiresAt).toEqual(times.absExpiresAt);
  });

  it('ends at the absolute limit, however active the user was', () => {
    let t = times;
    for (let ms = SESSION_TOUCH_MS; ms < SESSION_ABSOLUTE_MS; ms += SESSION_TOUCH_MS) {
      t = { ...t, ...touched(t, at(ms)) };
    }
    expect(sessionVerdict(t, at(SESSION_ABSOLUTE_MS - 1))).not.toBe('expired');
    expect(sessionVerdict(t, at(SESSION_ABSOLUTE_MS))).toBe('expired');
  });
});
