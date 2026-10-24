import { sql } from 'drizzle-orm';
import { boolean, check, index, integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';

import { at } from './columns';
import { users } from './identity';

/**
 * One row per dedupe key of a `mail.send` job (ADR 0016): claimed before the
 * Graph call, settled after it, so a retry knows whether the mail went out.
 * Ids, states and short codes only; never an address, subject or body. Only
 * the worker group may touch it (migration 0009); `mail.prune` deletes rows
 * MAIL_LEDGER_RETENTION_DAYS after they settled.
 */
export const mailLedger = pgTable(
  'mail_ledger',
  {
    /** The job's dedupe key, e.g. `access.approved:<requestId>`. */
    dedupeKey: text().primaryKey(),
    template: text().notNull(),
    /** A deleted person's records go with them. */
    recipientId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** The request or user the mail is about; no foreign key, it may be purged first. */
    subjectId: uuid().notNull(),
    state: text().notNull(),
    /** Sends whose outcome is unknown; at two the key goes to the dead letters. */
    unknownSends: integer().notNull().default(0),
    attempts: integer().notNull().default(0),
    /** When a Graph or SMTP call was last started for this key. */
    claimedAt: at(),
    settledAt: at(),
    code: text(),
    graphRequestId: text(),
  },
  (t) => [
    index('mail_ledger_claimed_at')
      .on(t.claimedAt)
      .where(sql`${t.state} IN ('sending', 'unknown', 'sent', 'failed')`),
    check('mail_ledger_dedupe_key_length', sql`length(${t.dedupeKey}) <= 120`),
    check(
      'mail_ledger_state',
      sql`${t.state} IN ('sending', 'unknown', 'sent', 'deferred', 'skipped', 'failed')`,
    ),
    check('mail_ledger_unknown_sends', sql`${t.unknownSends} >= 0`),
    check(
      'mail_ledger_code',
      sql`${t.code} ~ '^[a-z]+(\\.[A-Za-z0-9_-]+)*$' AND length(${t.code}) <= 40`,
    ),
    check('mail_ledger_graph_request_id_length', sql`length(${t.graphRequestId}) <= 64`),
  ],
);

/**
 * The one row that pauses all sending until `not_before` (Retry-After, an
 * auth failure). Migration 0009 inserts it; nothing deletes it.
 */
export const mailGate = pgTable(
  'mail_gate',
  {
    id: boolean().primaryKey().default(true),
    notBefore: at(),
    code: text(),
  },
  (t) => [check('mail_gate_single_row', sql`${t.id}`)],
);
