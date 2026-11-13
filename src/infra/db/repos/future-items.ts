import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableName,
  gt,
  gte,
  isNotNull,
  lt,
  lte,
  ne,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';

import {
  futureReviewScopeOf,
  futureWriteScopeOf,
  scopeOf,
  ScopeViolation,
  StaleVersion,
  type FutureContent,
  type FutureCursor,
  type FutureItemRecord,
  type FutureItemRepo,
  type TxContext,
} from '@/application/ports';
import type { FutureState } from '@/domain/review';
import { parseIsoDate, toIsoDate } from '@/domain/time';

import { scopeWhere } from '../scope-sql';
import { futureEvents, futureItems } from '../schema';
import type { TxDatabase } from './database';
import { dateOrNull, isoDate, isoTime, timeOrNull } from './wall-columns';

/** The columns a FutureItemRecord is made of; `clientRef` stays in the table. */
export const ITEM_ROW = {
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
  organizer: futureItems.organizer,
  organizerRole: futureItems.organizerRole,
  participants: futureItems.participants,
  note: futureItems.note,
  reportState: futureItems.reportState,
  reportPointId: futureItems.reportPointId,
  submittedAt: futureItems.submittedAt,
  cancelRequestedAt: futureItems.cancelRequestedAt,
  version: futureItems.version,
  updatedAt: futureItems.updatedAt,
};

type ItemRow = Pick<typeof futureItems.$inferSelect, keyof typeof ITEM_ROW>;

export function toRecord(row: ItemRow): FutureItemRecord {
  const { id, kind, authorId, state, reportState, reportPointId, submittedAt, cancelRequestedAt } =
    row;
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
      organizer: row.organizer,
      organizerRole: row.organizerRole,
      participants: row.participants,
      note: row.note,
    },
    reportState,
    reportPointId,
    submittedAt,
    cancelRequestedAt,
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
  organizer: content.organizer,
  organizerRole: content.organizerRole,
  participants: content.participants,
  note: content.note,
});

const ITEM_SCOPE = {
  owner: futureItems.authorId,
  kind: futureItems.kind,
  state: futureItems.state,
  submittedAt: futureItems.submittedAt,
};

/** The rows the principal may see: the SQL projection of the policy's read scope. */
export const visibleFutureItems = (ctx: TxContext): SQL | undefined =>
  scopeWhere(scopeOf(ctx.principal, 'futureItem'), ITEM_SCOPE);

/** The rows whose history the principal may read; an approved akce's is not a colleague's. */
export const reviewableFutureItems = (ctx: TxContext): SQL | undefined =>
  scopeWhere(futureReviewScopeOf(ctx.principal), ITEM_SCOPE);

/** The rows the principal may lock and change: the author's own (futureWriteScopeOf). */
const writableFutureItems = (ctx: TxContext): SQL | undefined =>
  scopeWhere(futureWriteScopeOf(ctx.principal), ITEM_SCOPE);

/**
 * True when the item's newest event is `revise`: its author changed it once it was approved, and
 * it has not been decided or handed in again since. Events list newest first, ties to the higher id.
 * The item's id is named with its table: a select from one table leaves column names bare, and a
 * bare `id` here would be the event's.
 */
const revised = sql<boolean>`coalesce((
  select ${futureEvents.event} from ${futureEvents}
  where ${futureEvents.futureItemId} = ${sql.identifier(getTableName(futureItems))}.${sql.identifier('id')}
  order by ${futureEvents.createdAt} desc, ${futureEvents.id} desc limit 1
) = 'revise', false)`;

/** The rows after `before` in the list's order: an older change, or the same instant and a lower id. */
const after = (before: FutureCursor | undefined): SQL | undefined =>
  before &&
  or(
    lt(futureItems.updatedAt, before.updatedAt),
    and(eq(futureItems.updatedAt, before.updatedAt), lt(futureItems.id, before.id)),
  );

/** Future items over the transaction's connection, read through the principal's scope. */
export function createFutureItemRepo(
  db: TxDatabase,
  ctx: TxContext,
): Omit<
  FutureItemRepo,
  | 'forIssue'
  | 'waitingFor'
  | 'awaitingReport'
  | 'owedTo'
  | 'markMissed'
  | 'reportsEnding'
  | 'reportEnding'
  | 'reportsOwed'
> {
  const { principal, now } = ctx;
  const byId = (id: string, where: SQL | undefined) =>
    db
      .select(ITEM_ROW)
      .from(futureItems)
      .where(and(eq(futureItems.id, id), where));

  /** One versioned update of a row in `scope`: the version rises by one; StaleVersion when no row matches. */
  const versioned = async (
    id: string,
    expectedVersion: number,
    scope: SQL | undefined,
    set: Partial<typeof futureItems.$inferInsert> & { state?: FutureState },
  ) => {
    // Any move of the state clears a pending cancel request (ADR 0062).
    const cleared = set.state === undefined ? {} : { cancelRequestedAt: null };
    const [row] = await db
      .update(futureItems)
      .set({ ...set, ...cleared, version: sql`${futureItems.version} + 1`, updatedAt: now })
      .where(and(eq(futureItems.id, id), eq(futureItems.version, expectedVersion), scope))
      .returning(ITEM_ROW);
    if (!row) throw new StaleVersion();
    return toRecord(row);
  };

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
      const [row] = await byId(id, visibleFutureItems(ctx));
      return row ? toRecord(row) : null;
    },
    async loadForWrite(id) {
      const [row] = await byId(id, writableFutureItems(ctx)).for('update');
      return row ? toRecord(row) : null;
    },
    async loadForDecision(id) {
      const [row] = await byId(id, reviewableFutureItems(ctx)).for('update');
      return row ? toRecord(row) : null;
    },
    async update(id, expectedVersion, { content, state, submittedAt, reportState, reportPointId }) {
      return versioned(id, expectedVersion, writableFutureItems(ctx), {
        // Named one by one: a wider object passed as a patch cannot touch other columns.
        ...(content && contentColumns(content)),
        ...(state !== undefined && { state }),
        ...(submittedAt !== undefined && { submittedAt }),
        ...(reportState !== undefined && { reportState }),
        ...(reportPointId !== undefined && { reportPointId }),
      });
    },
    async decide(id, expectedVersion, state) {
      return versioned(id, expectedVersion, reviewableFutureItems(ctx), { state });
    },
    async markCancelRequest(id, expectedVersion, at) {
      return versioned(id, expectedVersion, reviewableFutureItems(ctx), { cancelRequestedAt: at });
    },
    async queue(limit) {
      const waiting = or(
        eq(futureItems.state, 'submitted'),
        and(eq(futureItems.state, 'approved'), isNotNull(futureItems.cancelRequestedAt)),
      );
      const rows = await db
        .select({ ...ITEM_ROW, revised })
        .from(futureItems)
        .where(and(visibleFutureItems(ctx), waiting))
        .orderBy(
          asc(sql`coalesce(${futureItems.cancelRequestedAt}, ${futureItems.submittedAt})`),
          asc(futureItems.id),
        )
        .limit(limit);
      return rows.map(({ revised: wasRevised, ...row }) => ({
        item: toRecord(row),
        revised: wasRevised,
      }));
    },
    async list(limit, before) {
      const rows = await db
        .select(ITEM_ROW)
        .from(futureItems)
        .where(and(visibleFutureItems(ctx), after(before)))
        .orderBy(desc(futureItems.updatedAt), desc(futureItems.id))
        .limit(limit);
      return rows.map(toRecord);
    },
    async reportPromptDue({ from, to }) {
      if (principal.kind !== 'system') throw new ScopeViolation();
      // The columns migrations 0022 and 0046 grant the worker, and no other.
      const lastDay = sql`coalesce(${futureItems.endDate}, ${futureItems.startDate})`;
      const rows = await db
        .select({
          id: futureItems.id,
          authorId: futureItems.authorId,
          lastDay: sql<string>`${lastDay}::text`,
        })
        .from(futureItems)
        .where(
          and(
            eq(futureItems.state, 'approved'),
            eq(futureItems.kind, 'akce'),
            eq(futureItems.reportState, 'none'),
            gte(lastDay, toIsoDate(from)),
            lte(lastDay, toIsoDate(to)),
          ),
        )
        .orderBy(asc(futureItems.id));
      return rows.map((row) => ({ ...row, lastDay: parseIsoDate(row.lastDay) }));
    },
    async mailFacts(id) {
      if (principal.kind !== 'system') throw new ScopeViolation();
      const [row] = await db
        .select({
          id: futureItems.id,
          authorId: futureItems.authorId,
          state: futureItems.state,
          reportState: futureItems.reportState,
        })
        .from(futureItems)
        .where(eq(futureItems.id, id));
      return row ?? null;
    },
    async countSubmittedSince({ since, notBy }) {
      if (principal.kind !== 'system') throw new ScopeViolation();
      const [row] = await db
        .select({ count: count() })
        .from(futureItems)
        .where(
          and(
            eq(futureItems.state, 'submitted'),
            gt(futureItems.submittedAt, since),
            ne(futureItems.authorId, notBy),
          ),
        );
      return row?.count ?? 0;
    },
  };
}
