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
