import { SETTINGS, type SettingKey, type SettingValues } from '@/contracts';
import { DatabaseFailure, type Tx } from '@/application/ports';

/** A setting as the code sees it: the value in force and the version a save must name (0: none stored). */
export interface SettingState<K extends SettingKey> {
  readonly value: SettingValues[K];
  readonly version: number;
}

/**
 * A stored value against the schema of its key. A value that fails is corruption, since saves are
 * validated: the failure carries the key and never the value (ADR 0015).
 */
function parseStored<K extends SettingKey>(key: K, stored: unknown): SettingValues[K] {
  const parsed = SETTINGS[key].schema.safeParse(stored);
  if (!parsed.success) throw new DatabaseFailure(`settings.invalid.${key}`);
  return parsed.data;
}

/**
 * `key` with the version a save must name: the stored value, or the default of the registry at
 * version 0 when no row exists. Selects the version, which the worker role may not read: for
 * the headmaster's screen and save only.
 */
export async function readSetting<K extends SettingKey>(
  tx: Pick<Tx, 'settings'>,
  key: K,
): Promise<SettingState<K>> {
  const stored = await tx.settings.get(key);
  if (stored === null) return { value: SETTINGS[key].default, version: 0 };
  return { value: parseStored(key, stored.value), version: stored.version };
}

/**
 * The value of `key` alone, read the way the worker's grant allows (`key` and `value` columns):
 * the stored value, or the default of the registry when no row exists.
 */
export async function readSettingValue<K extends SettingKey>(
  tx: Pick<Tx, 'settings'>,
  key: K,
): Promise<SettingValues[K]> {
  const stored = await tx.settings.value(key);
  return stored === null ? SETTINGS[key].default : parseStored(key, stored);
}
