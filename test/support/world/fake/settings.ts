import { ScopeViolation, type SettingsRepo, type TxContext } from '@/application/ports';
import { can } from '@/domain/policy';

import { guard, refusedBy } from './guards';
import type { FakeTxState } from './state';

/** jsonb's text form: a space after each `:` and `,`, which `octet_length(value::text)` counts. */
function jsonbText(value: unknown): string {
  if (value === undefined) return 'null';
  if (Array.isArray(value)) return `[${value.map(jsonbText).join(', ')}]`;
  if (typeof value === 'object' && value !== null) {
    // As JSON.stringify, which the driver uses: a member with no JSON form is dropped.
    const members = Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${JSON.stringify(k)}: ${jsonbText(v)}`);
    return `{${members.join(', ')}}`;
  }
  return JSON.stringify(value);
}

/** What migration 0028 refuses, in PostgreSQL's order (CHECKs by name): settings_key, settings_size, settings_value. */
function refuse(key: string, value: unknown): void {
  if (!/^[a-z0-9.]{1,64}$/.test(key)) throw refusedBy('settings_key');
  if (Buffer.byteLength(jsonbText(value)) > 65_536) throw refusedBy('settings_size');
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw refusedBy('settings_value');
  }
}

/** The settings repository over the fake state: a value is returned as the JSON it was stored as. */
export function fakeSettingsRepo(tx: FakeTxState, ctx: TxContext): SettingsRepo {
  const { principal } = ctx;
  return {
    async get(key) {
      guard(tx, false);
      const row = tx.draft.settings.get(key);
      return row ? structuredClone(row) : null;
    },
    async value(key) {
      guard(tx, false);
      const row = tx.draft.settings.get(key);
      return row ? structuredClone(row.value) : null;
    },
    async save(key, value, expectedVersion) {
      guard(tx, true);
      if (principal.kind === 'user' && !can(principal.actor, { action: 'settings.manage' })) {
        throw new ScopeViolation();
      }
      // An insert is checked before it meets an existing row; an update only once it matches one.
      if (expectedVersion === 0) refuse(key, value);
      const current = tx.draft.settings.get(key);
      if ((current?.version ?? 0) !== expectedVersion) return null;
      refuse(key, value);
      const version = expectedVersion + 1;
      tx.draft.settings.set(key, { value: structuredClone(value), version });
      return version;
    },
  };
}
