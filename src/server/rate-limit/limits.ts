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
  /**
   * The editor's autosave (points.save, future.save): a save every 1.5 s is 40 a minute, so
   * this leaves room for several tabs and a retry ladder, and still stops a script.
   */
  autosave: { max: 120, windowMs: MINUTE, key: 'user' },
  /** Branch arch-ui: the client reloads its state after each write, so well above autosave. */
  state: { max: 300, windowMs: MINUTE, key: 'user' },
  /**
   * Creating, submitting, proposing and an author's retract, withdraw or cancel; never
   * autosave. Deleting old drafts counts too, so it leaves room to tidy up and still hand in.
   */
  submission: { max: 60, windowMs: HOUR, key: 'user' },
  /**
   * An abuse guard for the headmaster's and reviewers' writes (deciding access requests and
   * points, reviewer edits, skipping a meeting): a person never reaches it.
   */
  admin: { max: 600, windowMs: HOUR, key: 'user' },
  accessRequest: { max: 3, windowMs: 24 * HOUR, key: 'user' },
} as const satisfies Record<string, Limit>;

export type LimitName = keyof typeof LIMITS;
