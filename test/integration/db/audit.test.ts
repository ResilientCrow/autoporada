import { eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { AUDIT_RETENTION_YEARS } from '@/domain/retention';
import { auditEvents } from '@/infra/db/schema';

import { pgErrorOf, setupTestDatabase } from '../../support/database';

const database = setupTestDatabase();
const DENIED = { code: '42501' };

async function record(action: string): Promise<string> {
  const [row] = await database.db.insert(auditEvents).values({ action }).returning();
  return row!.id;
}

/** An event `years` (and a day) in the past; only the owner can bypass the stamp. */
async function recordOld(action: string, years: number): Promise<void> {
  await database.owner(
    `BEGIN;
     ALTER TABLE audit_events DISABLE TRIGGER audit_events_stamp;
     INSERT INTO audit_events (action, at) VALUES ($$${action}$$, now() - make_interval(years => ${years}, days => 1));
     ALTER TABLE audit_events ENABLE TRIGGER audit_events_stamp;
     COMMIT;`,
  );
}

describe('audit events', () => {
  it('are stamped by the database clock, whatever the caller says', async () => {
    const [row] = await database.db
      .insert(auditEvents)
      .values({ action: 'test.backdate', at: new Date('2020-01-01T00:00:00Z') })
      .returning();
    expect(Date.now() - row!.at.getTime()).toBeLessThan(60_000);
  });

  it('can never be changed, by the app or by the owner', async () => {
    const id = await record('test.change');
    const change = database.db
      .update(auditEvents)
      .set({ action: 'x' })
      .where(eq(auditEvents.id, id));
    expect(await pgErrorOf(change)).toMatchObject(DENIED);
    expect(await pgErrorOf(database.owner(`UPDATE audit_events SET action = 'x'`))).toMatchObject(
      DENIED,
    );
    expect(await pgErrorOf(database.owner('TRUNCATE audit_events'))).toMatchObject(DENIED);
  });

  it('can be deleted only after the retention period', async () => {
    const id = await record('test.recent');
    const recent = database.db.delete(auditEvents).where(eq(auditEvents.id, id));
    expect(await pgErrorOf(recent)).toMatchObject(DENIED);
    expect(await pgErrorOf(database.owner(`DELETE FROM audit_events`))).toMatchObject(DENIED);

    await recordOld('test.expired', AUDIT_RETENTION_YEARS);
    await recordOld('test.kept', AUDIT_RETENTION_YEARS - 1);
    // The purge uses the same rule as the trigger, so it never trips it.
    await database.db.execute(
      sql`DELETE FROM audit_events WHERE at < now() - make_interval(years => ${AUDIT_RETENTION_YEARS})`,
    );
    const left = (await database.db.select({ action: auditEvents.action }).from(auditEvents)).map(
      (r) => r.action,
    );
    expect(left).toContain('test.recent');
    expect(left).toContain('test.kept');
    expect(left).not.toContain('test.expired');
  });

  it('keep the retention period of the domain', async () => {
    const [fn] = await database.owner<{ source: string }>(
      `SELECT prosrc AS source FROM pg_proc WHERE proname = 'audit_events_append_only'`,
    );
    expect(fn?.source).toContain(`interval '${AUDIT_RETENTION_YEARS} years'`);
  });
});
