import { and, asc, count, desc, eq, gt, gte, lt, lte, ne, or, sql, type SQL } from 'drizzle-orm';

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
import { futureItems } from '../schema';
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

/**
 * The class key of the per-author lock ('FUTC') that a create and a submit take to count the
 * author's future items against their caps. A different class from the points' lock: the two
 * kinds are capped on their own and never wait for each other.
 */
const CREATE_LOCK = 0x4655_5443;

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

  /** The id of the user the transaction runs for, after taking their lock until the transaction ends. */
  async function lockAuthor(): Promise<string> {
    if (principal.kind !== 'user') throw new ScopeViolation();
    const authorId = principal.actor.id;
    await db.execute(sql`SELECT pg_advisory_xact_lock(${CREATE_LOCK}, hashtext(${authorId}))`);
    return authorId;
  }

  return {
    async beginCreate(clientRef) {
      const authorId = await lockAuthor();
      // Statements after the lock read a new snapshot (READ COMMITTED): an earlier holder's
      // committed draft is counted.
      const own = eq(futureItems.authorId, authorId);
      const [existing] = await db
        .select(ITEM_ROW)
        .from(futureItems)
        .where(and(own, eq(futureItems.clientRef, clientRef)));
      const [drafts] = await db
        .select({ n: count() })
        .from(futureItems)
        .where(and(own, eq(futureItems.state, 'draft')));
      return { existing: existing ? toRecord(existing) : null, drafts: drafts?.n ?? 0 };
    },
    async beginSubmit() {
      const authorId = await lockAuthor();
      const [pending] = await db
        .select({ n: count() })
        .from(futureItems)
        .where(and(eq(futureItems.authorId, authorId), eq(futureItems.state, 'submitted')));
      return { pending: pending?.n ?? 0 };
    },
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
