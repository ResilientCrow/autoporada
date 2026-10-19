import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { createRateLimiter, LIMITS, type Limit, type LimitName } from './index';

const limits = (directory: Partial<Limit>): Record<LimitName, Limit> => ({
  ...LIMITS,
  directory: { ...LIMITS.directory, ...directory },
});

function limiterAt(directory: Partial<Limit>, maxKeys?: number) {
  const clock = { t: 0 };
  const limiter = createRateLimiter({
    limits: limits(directory),
    now: () => clock.t,
    ...(maxKeys && { maxKeys }),
  });
  return { clock, limiter };
}

describe('sliding-window rate limiter', () => {
  it('never allows more than max hits in any window', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 1, max: 1000 }),
        fc.array(fc.integer({ min: 0, max: 400 }), { maxLength: 60 }),
        (max, windowMs, gaps) => {
          const { clock, limiter } = limiterAt({ max, windowMs });
          const allowed: number[] = [];
          for (const gap of gaps) {
            clock.t += gap;
            if (limiter.take('directory', 'u1').ok) allowed.push(clock.t);
          }
          for (const t of allowed) {
            expect(allowed.filter((a) => a > t - windowMs && a <= t).length).toBeLessThanOrEqual(
              max,
            );
          }
        },
      ),
    );
  });

  it('says exactly how long to wait', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 2, max: 1000 }),
        (max, windowMs) => {
          const { clock, limiter } = limiterAt({ max, windowMs });
          for (let i = 0; i < max; i++) expect(limiter.take('directory', 'u1').ok).toBe(true);
          clock.t += 1;
          const refusal = limiter.take('directory', 'u1');
          if (refusal.ok) throw new Error('expected a refusal');
          expect(refusal.retryAfterMs).toBeGreaterThan(0);
          clock.t += refusal.retryAfterMs - 1;
          expect(limiter.take('directory', 'u1').ok).toBe(false);
          clock.t += 1;
          expect(limiter.take('directory', 'u1').ok).toBe(true);
        },
      ),
    );
  });

  it('does not count refused hits, so a flood cannot extend its own wait', () => {
    const { clock, limiter } = limiterAt({ max: 1, windowMs: 100 });
    expect(limiter.take('directory', 'u1').ok).toBe(true);
    for (clock.t = 1; clock.t < 100; clock.t += 10) limiter.take('directory', 'u1');
    clock.t = 100;
    expect(limiter.take('directory', 'u1').ok).toBe(true);
  });

  it('keeps limits and keys apart', () => {
    const { limiter } = limiterAt({ max: 1, windowMs: 1000 });
    expect(limiter.take('directory', 'u1').ok).toBe(true);
    expect(limiter.take('directory', 'u1').ok).toBe(false);
    expect(limiter.take('directory', 'u2').ok).toBe(true);
    expect(limiter.take('submission', 'u1').ok).toBe(true);
  });

  it('keeps each limit’s keys apart, so an address flood cannot reset a user’s limit', () => {
    const { limiter } = limiterAt({ max: 1, windowMs: 1000 }, 100);
    for (let i = 0; i < 3; i++) limiter.take('accessRequest', 'user-1');
    expect(limiter.take('accessRequest', 'user-1').ok).toBe(false);
    for (let i = 0; i < 1000; i++) limiter.take('auth', `2001:db8:${i}::/64`);
    expect(limiter.take('accessRequest', 'user-1').ok).toBe(false);
  });

  it('forgets the least recently used keys beyond maxKeys', () => {
    const { limiter } = limiterAt({ max: 1, windowMs: 1000 }, 2);
    limiter.take('directory', 'a');
    limiter.take('directory', 'b');
    limiter.take('directory', 'a');
    limiter.take('directory', 'c');
    // b was the least recently used and has been forgotten; a is still limited.
    expect(limiter.take('directory', 'a').ok).toBe(false);
    expect(limiter.take('directory', 'b').ok).toBe(true);
  });
});
