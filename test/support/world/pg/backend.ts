import type {
  AccessRequestRecord,
  PointTypeRecord,
  RegistryEntryRecord,
  RegistryListRecord,
} from '@/application/ports';

import type { TestDatabase } from '../../database';
import type { AuditRow, JobRow } from '../fake/state';

/**
 * Empties every table before a test, as the owner, past the append-only
 * guards (`TestDatabase.truncate`). The mail gate's one row comes back, as
 * migration 0009 inserted it.
 */
export async function resetTables(database: TestDatabase): Promise<void> {
  const [row] = await database.owner<{ tables: string | null }>(
    `SELECT string_agg(quote_ident(relname), ', ') AS tables
       FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r'`,
  );
  // The queue's rows go too; its queues stay, as the migrated template made them.
  await database.owner('TRUNCATE pgboss.job');
  if (!row?.tables) return;
  await database.truncate(row.tables);
  await database.owner('INSERT INTO mail_gate DEFAULT VALUES');
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

/** Deletes a user as the owner, past the repositories; the foreign keys cascade. */
export async function deleteUser(database: TestDatabase, id: string): Promise<void> {
  await database.owner('DELETE FROM users WHERE id = $1', [id]);
}

/** This database's transactions that wait on a lock, so a race test knows the other side is blocked. */
export async function lockWaits(database: TestDatabase): Promise<number> {
  const [row] = await database.owner<{ n: number }>(
    `SELECT count(*)::int AS n FROM pg_stat_activity
      WHERE datname = current_database() AND wait_event_type = 'Lock'`,
  );
  return row?.n ?? 0;
}

/** The queued jobs in the shape the fake world keeps them; the dead-letter queue and pg-boss's own are not jobs. */
export async function jobRows(database: TestDatabase): Promise<readonly JobRow[]> {
  const rows = await database.owner<{
    name: JobRow['name'];
    data: JobRow['data'];
    singleton_key: string;
    start_after: Date;
    created_on: Date;
  }>(
    `SELECT name, data, singleton_key, start_after, created_on FROM pgboss.job
      WHERE name NOT LIKE '\\_\\_pgboss%' AND name <> 'dead' ORDER BY created_on, id`,
  );
  return rows.map((r) => ({
    name: r.name,
    data: r.data,
    options: {
      dedupeKey: r.singleton_key,
      // pg-boss fills start_after with the creation time when none was given; a start the
      // clock of a test put in the past still differs from it
      ...(r.start_after.getTime() !== r.created_on.getTime() && { startAfter: r.start_after }),
    },
  }));
}

/** Inserts a point type as the owner: the repository is read-only until the admin saves (commit 49). */
export async function insertPointType(
  database: TestDatabase,
  row: Omit<PointTypeRecord, 'id' | 'version'>,
): Promise<PointTypeRecord> {
  const [inserted] = await database.owner<{ id: string; version: number }>(
    `INSERT INTO point_types (name, title_gender, default_bullets, active, locked, position)
     VALUES ($1, $2, $3::jsonb, $4, $5, $6) RETURNING id, version`,
    [
      row.name,
      row.titleGender,
      JSON.stringify(row.defaultBullets),
      row.active,
      row.locked,
      row.position,
    ],
  );
  if (!inserted) throw new Error('insertPointType: no row returned');
  return { ...row, id: inserted.id, version: inserted.version };
}

/** Inserts a setting as the owner, past the checks of any schema: the repository only reads. */
export async function insertSetting(
  database: TestDatabase,
  key: string,
  value: unknown,
): Promise<void> {
  await database.owner(`INSERT INTO settings (key, value) VALUES ($1, $2::jsonb)`, [
    key,
    JSON.stringify(value),
  ]);
}

/** The position after the last registry list, as the owner sees it. */
export async function nextListPosition(database: TestDatabase): Promise<number> {
  const [row] = await database.owner<{ next: number }>(
    `SELECT coalesce(max(position), 0)::int + 1 AS next FROM registry_lists`,
  );
  return row?.next ?? 1;
}

/** Inserts a registry list as the owner, past the repository and its audit. */
export async function insertRegistryList(
  database: TestDatabase,
  row: Omit<RegistryListRecord, 'id' | 'version'>,
): Promise<RegistryListRecord> {
  const [inserted] = await database.owner<{ id: string; version: number }>(
    `INSERT INTO registry_lists (key, title, doc_label, purpose, position, active)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, version`,
    [row.key, row.title, row.docLabel, row.purpose, row.position, row.active],
  );
  if (!inserted) throw new Error('insertRegistryList: no row returned');
  return { ...row, id: inserted.id, version: inserted.version };
}

/**
 * Inserts a registry entry as the owner. A printed one points at an issue, which is made for it
 * (the issue of 2026-01-05, once).
 */
export async function insertRegistryEntry(
  database: TestDatabase,
  row: Omit<RegistryEntryRecord, 'id' | 'version'>,
  printed: boolean,
): Promise<RegistryEntryRecord> {
  let issueId: string | null = null;
  if (printed) {
    await database.owner(
      `INSERT INTO issues (monday, meeting_date, school_year, deadline_at)
       VALUES ('2026-01-05', '2026-01-05', '2025/2026', '2026-01-02T10:00:00Z')
       ON CONFLICT (monday) DO NOTHING`,
    );
    const [issue] = await database.owner<{ id: string }>(
      `SELECT id FROM issues WHERE monday = '2026-01-05'`,
    );
    issueId = issue?.id ?? null;
  }
  const [inserted] = await database.owner<{ id: string; version: number }>(
    `INSERT INTO registry_entries
       (list_id, given_name, family_name, class_code, added_at, removed_at, archived_year, first_published_issue_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, version`,
    [
      row.listId,
      row.givenName,
      row.familyName,
      row.classCode,
      row.addedAt,
      row.removedAt,
      row.archivedYear,
      issueId,
    ],
  );
  if (!inserted) throw new Error('insertRegistryEntry: no row returned');
  return { ...row, firstPublishedIssueId: issueId, id: inserted.id, version: inserted.version };
}
