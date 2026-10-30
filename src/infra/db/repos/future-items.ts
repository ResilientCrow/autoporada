import { and, desc, eq, sql, type SQL } from 'drizzle-orm';

import {
  scopeOf,
  ScopeViolation,
  StaleVersion,
  type FutureContent,
  type FutureItemRecord,
  type FutureItemRepo,
  type TxContext,
} from '@/application/ports';

import { scopeWhere } from '../scope-sql';
import { futureItems } from '../schema';
import type { TxDatabase } from './database';
import { dateOrNull, isoDate, isoTime, timeOrNull } from './wall-columns';

/** The columns a FutureItemRecord is made of; `clientRef` stays in the table. */
const ITEM_ROW = {
  id: futureItems.id,
  kind: futureItems.kind,
  authorId: futureItems.authorId,
  state: futureItems.state,
  title: futureItems.title,
  startDate: futureItems.startDate,
  endDate: futureItems.endDate,
  timeFrom: futureItems.timeFrom,
  timeTo: futureItems.timeTo,
  campus: futureItems.campus,
  place: futureItems.place,
  responsible: futureItems.responsible,
  expectsReport: futureItems.expectsReport,
  reportState: futureItems.reportState,
  reportPointId: futureItems.reportPointId,
  submittedAt: futureItems.submittedAt,
  version: futureItems.version,
  updatedAt: futureItems.updatedAt,
};

type ItemRow = Pick<typeof futureItems.$inferSelect, keyof typeof ITEM_ROW>;

function toRecord(row: ItemRow): FutureItemRecord {
  const { id, kind, authorId, state, reportState, reportPointId, submittedAt } = row;
  return {
    id,
    kind,
    authorId,
    state,
    content: {
      title: row.title,
      startDate: dateOrNull(row.startDate),
      endDate: dateOrNull(row.endDate),
      timeFrom: timeOrNull(row.timeFrom),
      timeTo: timeOrNull(row.timeTo),
      campus: row.campus,
      place: row.place,
      responsible: row.responsible,
      expectsReport: row.expectsReport,
    },
    reportState,
    reportPointId,
    submittedAt,
    version: row.version,
    updatedAt: row.updatedAt,
  };
}

/** The content as column values. */
const contentColumns = (content: FutureContent) => ({
  title: content.title,
  startDate: isoDate(content.startDate),
  endDate: isoDate(content.endDate),
  timeFrom: isoTime(content.timeFrom),
  timeTo: isoTime(content.timeTo),
  campus: content.campus,
  place: content.place,
  responsible: content.responsible,
  expectsReport: content.expectsReport,
});

/** The rows the principal may see: the SQL projection of the policy's read scope. */
export const visibleFutureItems = (ctx: TxContext): SQL | undefined =>
  scopeWhere(scopeOf(ctx.principal, 'futureItem'), {
    owner: futureItems.authorId,
    kind: futureItems.kind,
    state: futureItems.state,
    submittedAt: futureItems.submittedAt,
  });

/** Future items over the transaction's connection, read through the principal's scope. */
export function createFutureItemRepo(db: TxDatabase, ctx: TxContext): FutureItemRepo {
  const { principal, now } = ctx;
  const byId = (id: string) =>
    db
      .select(ITEM_ROW)
      .from(futureItems)
      .where(and(eq(futureItems.id, id), visibleFutureItems(ctx)));

  return {
    async create({ clientRef, kind, content }) {
      if (principal.kind !== 'user') throw new ScopeViolation();
      const authorId = principal.actor.id;
      // Under READ COMMITTED a concurrent retry waits on future_items_author_client_ref_key,
      // then inserts nothing; the SELECT, a new snapshot, sees the committed row.
      const [created] = await db
        .insert(futureItems)
        .values({
          kind,
          authorId,
          clientRef,
          ...contentColumns(content),
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing({ target: [futureItems.authorId, futureItems.clientRef] })
        .returning(ITEM_ROW);
      if (created) return { item: toRecord(created), inserted: true };
      const [existing] = await db
        .select(ITEM_ROW)
        .from(futureItems)
        .where(and(eq(futureItems.authorId, authorId), eq(futureItems.clientRef, clientRef)));
      if (!existing) throw new Error('create: the item is missing after its insert');
      return { item: toRecord(existing), inserted: false };
    },
    async get(id) {
      const [row] = await byId(id);
      return row ? toRecord(row) : null;
    },
    async loadForWrite(id) {
      const [row] = await byId(id).for('update');
      return row ? toRecord(row) : null;
    },
    async update(id, expectedVersion, { content, state, submittedAt }) {
      const [row] = await db
        .update(futureItems)
        .set({
          // Named one by one: a wider object passed as a patch cannot touch other columns.
          ...(content && contentColumns(content)),
          ...(state !== undefined && { state }),
          ...(submittedAt !== undefined && { submittedAt }),
          version: sql`${futureItems.version} + 1`,
          updatedAt: now,
        })
        .where(
          and(
            eq(futureItems.id, id),
            eq(futureItems.version, expectedVersion),
            visibleFutureItems(ctx),
          ),
        )
        .returning(ITEM_ROW);
      if (!row) throw new StaleVersion();
      return toRecord(row);
    },
    async list(limit) {
      const rows = await db
        .select(ITEM_ROW)
        .from(futureItems)
        .where(visibleFutureItems(ctx))
        .orderBy(desc(futureItems.updatedAt), desc(futureItems.id))
        .limit(limit);
      return rows.map(toRecord);
    },
  };
}
