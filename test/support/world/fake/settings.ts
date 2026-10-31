import type { SettingsRepo } from '@/application/ports';

import { guard } from './guards';
import type { FakeTxState } from './state';

/** The settings repository over the fake state: a value is returned as the JSON it was stored as. */
export function fakeSettingsRepo(tx: FakeTxState): SettingsRepo {
  return {
    async get(key) {
      guard(tx, false);
      const row = tx.draft.settings.get(key);
      return row ? structuredClone(row) : null;
    },
  };
}
