/** One limit: at most `max` allowed hits in any `windowMs`, per user or per client address. */
export interface Limit {
  readonly max: number;
  readonly windowMs: number;
  readonly key: 'user' | 'ip';
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** Plan §4. Rules that must survive a restart (access-request cooldown) live in the database. */
export const LIMITS = {
  /** Loose: the whole school signs in from one NAT address. Tune at the M4 smoke test. */
  auth: { max: 600, windowMs: MINUTE, key: 'ip' },
  /** A class of fifteen needs about 45 searches a minute. */
  directory: { max: 120, windowMs: MINUTE, key: 'user' },
  /** Creating, submitting and proposing; never autosave. */
  submission: { max: 30, windowMs: HOUR, key: 'user' },
  /** An abuse guard for the headmaster's writes (deciding requests): a person never reaches it. */
  admin: { max: 600, windowMs: HOUR, key: 'user' },
  accessRequest: { max: 3, windowMs: 24 * HOUR, key: 'user' },
} as const satisfies Record<string, Limit>;

export type LimitName = keyof typeof LIMITS;
