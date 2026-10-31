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
}
