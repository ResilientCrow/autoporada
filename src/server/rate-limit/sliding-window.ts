import type { Limit, LimitName } from './limits';

export type Decision =
  { readonly ok: true } | { readonly ok: false; readonly retryAfterMs: number };

export interface RateLimiter {
  take(name: LimitName, key: string): Decision;
}

export interface RateLimiterOptions {
  readonly limits: Readonly<Record<LimitName, Limit>>;
  /** A monotonic clock in ms (performance.now): immune to the wall clock jumping. */
  readonly now: () => number;
  /** Bounds memory per limit; the least recently used key is forgotten first. */
  readonly maxKeys?: number;
}

/**
 * An exact sliding-window log, in memory: one process, one web replica
 * (ADR 0008). Refused hits are not recorded, so a refused flood cannot
 * extend its own wait. Each limit keeps its own keys, so a flood of client
 * addresses on one limit cannot push another limit's users out.
 */
export function createRateLimiter(options: RateLimiterOptions): RateLimiter {
  const maxKeys = options.maxKeys ?? 20_000;
  // A Map keeps insertion order: re-inserting on every hit makes it an LRU.
  const stores = new Map<LimitName, Map<string, number[]>>();
  const storeOf = (name: LimitName) => {
    const store = stores.get(name) ?? new Map<string, number[]>();
    stores.set(name, store);
    return store;
  };

  return {
    take(name, key) {
      const { max, windowMs } = options.limits[name];
      const hits = storeOf(name);
      const now = options.now();
      const recent = (hits.get(key) ?? []).filter((at) => at > now - windowMs);
      hits.delete(key);
      if (recent.length >= max) {
        hits.set(key, recent);
        const oldest = recent[0] ?? now;
        return { ok: false, retryAfterMs: Math.max(1, oldest + windowMs - now) };
      }
      recent.push(now);
      hits.set(key, recent);
      if (hits.size > maxKeys) {
        const leastRecent = hits.keys().next();
        if (!leastRecent.done) hits.delete(leastRecent.value);
      }
      return { ok: true };
    },
  };
}
