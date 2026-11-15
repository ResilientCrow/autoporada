/**
 * Branch arch-ui only: the reads the Arch UI's state is built from, and its two writes that are not
 * use cases (a porada's annexes, the type of a draft). Points and future items are read through the
 * repos' own scope SQL, so the policy decides what a viewer sees.
 */
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';

import type { TxContext } from '@/application/ports';
import { SETTINGS } from '@/contracts';
import { calendarBoundary } from '@/domain/calendar';
import { compareDates, instantToWallClock, parseIsoDate, type CalDate } from '@/domain/time';

import type { Database } from './client';
import { ITEM_ROW, toRecord as futureRecord, visibleFutureItems } from './repos/future-items';
import type { TxDatabase } from './repos/database';
import { POINT_ROW, toRecord as pointRecord, visiblePoints } from './repos/points-read';
import { lockSetting } from './repos/settings';
import {
  accessRequests,
  archAnnexes,
  auditEvents,
  futureEvents,
  futureItems,
  generatedDocuments,
  issueItems,
  issues,
  pointEvents,
  points,
  registryEntries,
  registryLists,
  reportPlaceholders,
  settings,
  users,
} from './schema';

export type ArchStore = ReturnType<typeof createArchStore>;

/** Whether a Monday with no row is a porada at `now`: after the calendar's boundary (ADR 0054 item 1). */
async function pastBoundary(
  tx: Pick<TxDatabase, 'select'>,
  monday: CalDate,
  now: Date,
): Promise<boolean> {
  const [row] = await tx
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, 'calendar'));
  const { plannedThrough } = row
    ? SETTINGS.calendar.schema.parse(row.value)
    : SETTINGS.calendar.default;
  const boundary = calendarBoundary(
    plannedThrough ? parseIsoDate(plannedThrough) : null,
    instantToWallClock(now).date,
  );
  return compareDates(monday, boundary) > 0;
}

export function createArchStore(db: Database) {
  return {
    settings: () => db.select().from(settings),
    points: async (ctx: TxContext) =>
      (await db.select(POINT_ROW).from(points).where(visiblePoints(ctx))).map(pointRecord),
    futures: async (ctx: TxContext) =>
      (await db.select(ITEM_ROW).from(futureItems).where(visibleFutureItems(ctx))).map(
        futureRecord,
      ),
    pointEvents: (ids: string[]) =>
      ids.length
        ? db
            .select()
            .from(pointEvents)
            .where(inArray(pointEvents.pointId, ids))
            .orderBy(asc(pointEvents.createdAt))
        : Promise.resolve([]),
    futureEvents: (ids: string[]) =>
      ids.length
        ? db
            .select()
            .from(futureEvents)
            .where(inArray(futureEvents.futureItemId, ids))
            .orderBy(asc(futureEvents.createdAt))
        : Promise.resolve([]),
    /** Everyone with `null`, else only these. */
    users: (ids: string[] | null) =>
      ids === null
        ? db.select().from(users)
        : db.select().from(users).where(inArray(users.id, ids)),
    issues: () => db.select().from(issues).orderBy(asc(issues.monday)),
    placeholders: (futureIds: string[]) =>
      futureIds.length
        ? db
            .select()
            .from(reportPlaceholders)
            .where(inArray(reportPlaceholders.futureItemId, futureIds))
        : Promise.resolve([]),
    documents: () =>
      db
        .select({
          issueId: generatedDocuments.issueId,
          snapshot: generatedDocuments.snapshot,
          pdfStatus: generatedDocuments.pdfStatus,
          pdfFailure: generatedDocuments.pdfFailure,
          generatedAt: generatedDocuments.generatedAt,
          version: generatedDocuments.version,
        })
        .from(generatedDocuments),
    annexes: () => db.select().from(archAnnexes),
    issueItems: (issueId: string) =>
      db
        .select()
        .from(issueItems)
        .where(eq(issueItems.issueId, issueId))
        .orderBy(asc(issueItems.section), asc(issueItems.position)),
    registry: async () => ({
      lists: await db.select().from(registryLists).orderBy(asc(registryLists.position)),
      entries: await db
        .select()
        .from(registryEntries)
        .where(and(isNull(registryEntries.removedAt), isNull(registryEntries.archivedYear))),
    }),
    /** Everyone's with `null`, else this user's. */
    accessRequests: (userId: string | null) =>
      userId === null
        ? db.select().from(accessRequests)
        : db.select().from(accessRequests).where(eq(accessRequests.userId, userId)),

    /**
     * The porada's own annexes at `now`. Under the deadline lock in share mode, as every issue
     * writer (ADR 0032): a drop in flight (update mode) hands them over first. `not-found` for a
     * Monday up to the calendar's boundary with no row, a dropped porada (ADR 0054 item 7), so a
     * stale tab never leaves annexes behind for a later add; `not-open` once the porada is
     * generated, as its document already holds its annexes.
     */
    async saveAnnexes(
      monday: string,
      annexes: unknown[],
      actorId: string,
      now: Date,
    ): Promise<'saved' | 'not-open' | 'not-found'> {
      return db.transaction(async (tx) => {
        await lockSetting(tx, 'deadline', 'share');
        const [issue] = await tx
          .select({ id: issues.id, status: issues.status })
          .from(issues)
          .where(eq(issues.monday, monday))
          .for('update');
        if (issue && issue.status !== 'open') return 'not-open';
        if (!issue && !(await pastBoundary(tx, parseIsoDate(monday), now))) return 'not-found';
        await tx
          .insert(archAnnexes)
          .values({ monday, annexes })
          .onConflictDoUpdate({
            target: archAnnexes.monday,
            set: { annexes, version: sql`${archAnnexes.version} + 1`, updatedAt: sql`now()` },
          });
        await tx.insert(auditEvents).values({
          actorId,
          action: 'issue.annexes',
          targetType: 'issue',
          ...(issue && { targetId: issue.id }),
          data: { monday },
        });
        return 'saved';
      });
    },

    /** The author's own finance or pokyn draft or returned point, moved to the other kind; the new version, or null on a stale version. */
    async retype(input: {
      id: string;
      authorId: string;
      expectedVersion: number;
      kind: 'finance' | 'pokyn';
    }): Promise<number | null> {
      const { id, authorId, expectedVersion, kind } = input;
      const [row] = await db
        .update(points)
        .set({ kind, version: sql`${points.version} + 1`, updatedAt: sql`now()` })
        .where(
          and(
            eq(points.id, id),
            eq(points.authorId, authorId),
            eq(points.version, expectedVersion),
            inArray(points.state, ['draft', 'returned']),
            inArray(points.kind, ['finance', 'pokyn']),
          ),
        )
        .returning({ version: points.version });
      return row ? row.version : null;
    },
  };
}
