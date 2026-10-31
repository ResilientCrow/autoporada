import { eq } from 'drizzle-orm';

import type { SettingsRepo } from '@/application/ports';

import { settings } from '../schema';
import type { TxDatabase } from './database';

export function createSettingsRepo(db: TxDatabase): SettingsRepo {
  return {
    async get(key) {
      const [row] = await db
        .select({ value: settings.value, version: settings.version })
        .from(settings)
        .where(eq(settings.key, key));
      return row ?? null;
    },
  };
}
