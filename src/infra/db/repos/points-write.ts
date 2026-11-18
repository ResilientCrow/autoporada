import { and, count, eq, sql } from 'drizzle-orm';

import { ScopeViolation, StaleVersion, type PointRepo, type TxContext } from '@/application/ports';
import type { PointContent } from '@/domain/report';
import { toIsoDate } from '@/domain/time';

import { points } from '../schema';
import type { TxDatabase } from './database';
import { parseJsonb, POINT_ROW, toRecord, visiblePoints } from './points-read';
import { isoDate, isoTime } from './wall-columns';

/**
 * The class key of the per-author lock ('PNTC') that a create and a submit take
 * to count the author's points against their caps; the author's id, hashed, is
 * the object key. The two-key form shares no key space with the one-key locks
 * (mail-ledger.ts), and a hash collision only serialises two authors' creates.
 */
const CREATE_LOCK = 0x504e_5443;

/** The content as column values; the jsonb is parsed first, so a bad value never reaches a row. */
function contentColumns(content: PointContent) {
  return {
    title: content.title,
    eventDate: isoDate(content.eventDate),
    endDate: isoDate(content.endDate),
    timeFrom: isoTime(content.timeFrom),
    timeTo: isoTime(content.timeTo),
    campus: content.campus,
    place: content.place,
    opening: content.opening,
    openingEdited: content.openingEdited,
    ...parseJsonb(content),
  };
}

export function createPointWrites(
  db: TxDatabase,
  ctx: TxContext,
): Pick<PointRepo, 'create' | 'beginCreate' | 'beginSubmit' | 'update'> {
  const { principal, now } = ctx;

  /** The id of the user the transaction runs for, after taking their lock until the transaction ends. */
  async function lockAuthor(): Promise<string> {
    if (principal.kind !== 'user') throw new ScopeViolation();
    const authorId = principal.actor.id;
    await db.execute(sql`SELECT pg_advisory_xact_lock(${CREATE_LOCK}, hashtext(${authorId}))`);
    return authorId;
  }

  return {
    async create({ clientRef, kind, content, futureItemId }) {
      if (principal.kind !== 'user') throw new ScopeViolation();
      const authorId = principal.actor.id;
      // Under READ COMMITTED a concurrent retry waits on points_author_client_ref_key,
      // then inserts nothing; the SELECT, a new snapshot, sees the committed row.
      const [created] = await db
        .insert(points)
        .values({
          kind,
          authorId,
          clientRef,
          ...(futureItemId !== undefined && { futureItemId }),
          ...contentColumns(content),
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing({ target: [points.authorId, points.clientRef] })
        .returning(POINT_ROW);
      if (created) return { point: toRecord(created), inserted: true };
      const [existing] = await db
        .select(POINT_ROW)
        .from(points)
        .where(and(eq(points.authorId, authorId), eq(points.clientRef, clientRef)));
      if (!existing) throw new Error('create: the point is missing after its insert');
      return { point: toRecord(existing), inserted: false };
    },
    async beginCreate(clientRef) {
      const authorId = await lockAuthor();
      // Statements after the lock read a new snapshot (READ COMMITTED): an earlier
      // holder's committed draft is counted.
      const own = eq(points.authorId, authorId);
      const [existing] = await db
        .select(POINT_ROW)
        .from(points)
        .where(and(own, eq(points.clientRef, clientRef)));
      const [drafts] = await db
        .select({ n: count() })
        .from(points)
        .where(and(own, eq(points.state, 'draft')));
      return { existing: existing ? toRecord(existing) : null, drafts: drafts?.n ?? 0 };
    },
    async beginSubmit() {
      const authorId = await lockAuthor();
      // As in beginCreate: the count is a new snapshot, after the lock.
      const [pending] = await db
        .select({ n: count() })
        .from(points)
        .where(and(eq(points.authorId, authorId), eq(points.state, 'submitted')));
      return { pending: pending?.n ?? 0 };
    },
    async update(
      id,
      expectedVersion,
      { content, state, earliestMonday, submittedAt, handInMonday },
    ) {
      const [row] = await db
        .update(points)
        .set({
          // Named one by one: a wider object passed as a patch cannot touch other columns.
          ...(content && contentColumns(content)),
          ...(state !== undefined && { state }),
          ...(earliestMonday !== undefined && { earliestMonday: toIsoDate(earliestMonday) }),
          ...(submittedAt !== undefined && { submittedAt }),
          ...(handInMonday !== undefined && {
            handInMonday: handInMonday && toIsoDate(handInMonday),
          }),
          version: sql`${points.version} + 1`,
          updatedAt: now,
        })
        .where(and(eq(points.id, id), eq(points.version, expectedVersion), visiblePoints(ctx)))
        .returning(POINT_ROW);
      if (!row) throw new StaleVersion();
      return toRecord(row);
    },
  };
}
