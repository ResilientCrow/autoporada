import { and, eq, sql } from 'drizzle-orm';

import { ScopeViolation, type SettingsRepo, type TxContext } from '@/application/ports';
import { can } from '@/domain/policy';

import { archAnnexes, settings } from '../schema';
import type { TxDatabase } from './database';

/**
 * The class key of the setting locks ('STNG'); the key's name, hashed, is the object key. The
 * two-key form shares no key space with the one-key locks (mail-ledger.ts).
 */
const SETTING_LOCK = 0x5354_4e47;

/** `SettingsRepo.lock` for a transaction that is no port's (the Arch UI's annexes, `arch.ts`). */
export async function lockSetting(
  db: Pick<TxDatabase, 'execute'>,
  key: string,
  mode: 'share' | 'update',
): Promise<void> {
  await (mode === 'share'
    ? db.execute(sql`SELECT pg_advisory_xact_lock_shared(${SETTING_LOCK}, hashtext(${key}))`)
    : db.execute(sql`SELECT pg_advisory_xact_lock(${SETTING_LOCK}, hashtext(${key}))`));
}

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
      // Branch arch-ui: the porada's annexes live in their own table (too big for settings).
      const annex = /^arch\.annexes\.(\d{4})(\d{2})(\d{2})$/.exec(key);
      if (annex) {
        const [a] = await db
          .select({ annexes: archAnnexes.annexes })
          .from(archAnnexes)
          .where(eq(archAnnexes.monday, `${annex[1]}-${annex[2]}-${annex[3]}`));
        return a ? a.annexes : null;
      }
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
    lock: (key, mode) => lockSetting(db, key, mode),
  };
}
