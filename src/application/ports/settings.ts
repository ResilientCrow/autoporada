/** A stored setting: the JSON as written and the version a save must name. */
export interface StoredSetting {
  /** Not checked against any schema: the repository does not know the keys. */
  readonly value: unknown;
  readonly version: number;
}

/**
 * The `settings` table, one row per key. Not personal data: the system (the worker too, once
 * granted) and every principal may read it; the use case decides who sees the screen.
 */
export interface SettingsRepo {
  /** The row, or null when nothing is stored and the key's default applies. */
  get(key: string): Promise<StoredSetting | null>;
  /**
   * The value alone, or null when nothing is stored. Selects `key` and `value` only: the worker
   * role is granted no more (ADR 0032), so its reads go through this and never through `get`.
   */
  value(key: string): Promise<unknown>;
  /**
   * Stores `value` for `key` if the row is still at `expectedVersion`, and gives the new version;
   * null when it is not (a stale save). Version 0 names "no row yet": the insert then loses
   * quietly to a row another save made first, so two first saves give one winner and one null.
   * The value is not checked against any schema; the table's CHECKs (key, object, 64 KiB) hold.
   * Only someone who may manage the settings writes (ADR 0011).
   */
  save(key: string, value: unknown, expectedVersion: number): Promise<number | null>;
  /**
   * Holds `key` until the transaction ends: 'share' waits only for an 'update' of it, 'update' for
   * both. A save that changes what callers freeze by takes 'update' before it reads; a caller that
   * freezes by the value takes 'share' before it reads, so under READ COMMITTED the two never
   * interleave (ADR 0032). Any principal, in a read transaction too, the worker's included.
   */
  lock(key: string, mode: 'share' | 'update'): Promise<void>;
}
