import type { AccessRequestRecord } from '@/application/ports';

import type { TestDatabase } from '../../database';
import type { AuditRow } from '../fake/state';

/**
 * Empties every table before a test, as the owner. The audit log refuses
 * TRUNCATE even from the owner, so the reset switches that trigger off
 * inside its own transaction; the app role can never do this.
 */
export async function resetTables(database: TestDatabase): Promise<void> {
  const [row] = await database.owner<{ tables: string | null }>(
    `SELECT string_agg(quote_ident(relname), ', ') AS tables
       FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r'`,
  );
  if (!row?.tables) return;
  await database.owner(
    `BEGIN;
     ALTER TABLE audit_events DISABLE TRIGGER audit_events_no_truncate;
     TRUNCATE ${row.tables} RESTART IDENTITY CASCADE;
     ALTER TABLE audit_events ENABLE TRIGGER audit_events_no_truncate;
     COMMIT;`,
  );
}

/** The audit log in the shape the fake world keeps it. */
export async function auditRows(database: TestDatabase): Promise<readonly AuditRow[]> {
  const rows = await database.owner<{
    actor_id: string | null;
    action: string;
    target_type: string | null;
    target_id: string | null;
    data: Record<string, unknown>;
    request_id: string;
  }>(
    `SELECT actor_id, action, target_type, target_id, data, request_id
       FROM audit_events ORDER BY id`,
  );
  return rows.map((r) => ({
    actorId: r.actor_id,
    action: r.action,
    targetType: r.target_type,
    targetId: r.target_id,
    data: r.data,
    requestId: r.request_id,
  }));
}

/** Inserts a request as the owner, past the app role's grants and the repository's rules. */
export async function insertAccessRequest(
  database: TestDatabase,
  row: Omit<AccessRequestRecord, 'id' | 'version'>,
): Promise<AccessRequestRecord> {
  const [inserted] = await database.owner<{ id: string; version: number }>(
    `INSERT INTO access_requests (user_id, reason, state, decided_by, decided_at, created_at)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, version`,
    [row.userId, row.reason, row.state, row.decidedBy, row.decidedAt, row.createdAt],
  );
  if (!inserted) throw new Error('insertAccessRequest: no row returned');
  return { ...row, id: inserted.id, version: inserted.version };
}

/** This database's transactions that wait on a lock, so a race test knows the other side is blocked. */
export async function lockWaits(database: TestDatabase): Promise<number> {
  const [row] = await database.owner<{ n: number }>(
    `SELECT count(*)::int AS n FROM pg_stat_activity
      WHERE datname = current_database() AND wait_event_type = 'Lock'`,
  );
  return row?.n ?? 0;
}
