import { and, eq, sql } from 'drizzle-orm';

import { ScopeViolation, type SettingsRepo, type TxContext } from '@/application/ports';
import { can } from '@/domain/policy';

import { settings } from '../schema';
import type { TxDatabase } from './database';

export function createSettingsRepo(db: TxDatabase, ctx: TxContext): SettingsRepo {
  const { principal } = ctx;
  return {
    async get(key) {
      const [row] = await db
        .select({ value: settings.value, version: settings.version })
        .from(settings)
        .where(eq(settings.key, key));
      return row ?? null;
    },
    async value(key) {
      const [row] = await db
        .select({ value: settings.value })
        .from(settings)
        .where(eq(settings.key, key));
      return row ? row.value : null;
    },
    async save(key, value, expectedVersion) {
      if (principal.kind === 'user' && !can(principal.actor, { action: 'settings.manage' })) {
        throw new ScopeViolation();
      }
      // The insert never reaches settings_pkey: a row made first wins and this save is stale.
      const [row] =
        expectedVersion === 0
          ? await db
              .insert(settings)
              .values({ key, value, updatedAt: ctx.now })
              .onConflictDoNothing({ target: settings.key })
              .returning({ version: settings.version })
          : await db
              .update(settings)
              .set({ value, updatedAt: ctx.now, version: sql`${settings.version} + 1` })
              .where(and(eq(settings.key, key), eq(settings.version, expectedVersion)))
              .returning({ version: settings.version });
      return row?.version ?? null;
    },
  };
}
