import { and, asc, count, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';

import {
  ScopeViolation,
  StaleVersion,
  type RegistryEntryRecord,
  type RegistryListRecord,
  type RegistryRepo,
  type TxContext,
} from '@/application/ports';
import { can } from '@/domain/policy';

import { registryEntries, registryLists } from '../schema';
import type { TxDatabase } from './database';

const LIST_ROW = {
  id: registryLists.id,
  key: registryLists.key,
  title: registryLists.title,
  docLabel: registryLists.docLabel,
  purpose: registryLists.purpose,
  position: registryLists.position,
  active: registryLists.active,
  version: registryLists.version,
};

const ENTRY_ROW = {
  id: registryEntries.id,
  listId: registryEntries.listId,
  givenName: registryEntries.givenName,
  familyName: registryEntries.familyName,
  classCode: registryEntries.classCode,
  addedAt: registryEntries.addedAt,
  removedAt: registryEntries.removedAt,
  archivedYear: registryEntries.archivedYear,
  firstPublishedIssueId: registryEntries.firstPublishedIssueId,
  version: registryEntries.version,
};

const bump = sql`${registryEntries.version} + 1`;

export function createRegistryRepo(db: TxDatabase, ctx: TxContext): RegistryRepo {
  const { principal } = ctx;
  /** The names of students: the policy is re-checked on every call, whatever the use case declared (ADR 0011). */
  const mayView = () => {
    if (principal.kind === 'user' && !can(principal.actor, { action: 'registry.view' })) {
      throw new ScopeViolation();
    }
  };
  const mayEdit = () => {
    if (principal.kind === 'user' && !can(principal.actor, { action: 'registry.edit' })) {
      throw new ScopeViolation();
    }
  };
  const mayArchive = () => {
    if (principal.kind === 'user' && !can(principal.actor, { action: 'registry.newSchoolYear' })) {
      throw new ScopeViolation();
    }
  };
  const oneList = async (where: ReturnType<typeof eq>): Promise<RegistryListRecord | null> => {
    mayView();
    const [row] = await db.select(LIST_ROW).from(registryLists).where(where);
    return row ?? null;
  };
  return {
    async lists() {
      mayView();
      return db
        .select(LIST_ROW)
        .from(registryLists)
        .orderBy(asc(registryLists.position), asc(registryLists.id));
    },
    list: (id) => oneList(eq(registryLists.id, id)),
    listByKey: (key) => oneList(eq(registryLists.key, key)),
    async counts() {
      mayView();
      const rows = await db
        .select({
          listId: registryEntries.listId,
          active: count(),
          fresh: count(sql`CASE WHEN ${registryEntries.firstPublishedIssueId} IS NULL THEN 1 END`),
        })
        .from(registryEntries)
        .where(isNull(registryEntries.removedAt))
        .groupBy(registryEntries.listId);
      return rows;
    },
    async entries(listId) {
      mayView();
      return db
        .select(ENTRY_ROW)
        .from(registryEntries)
        .where(and(eq(registryEntries.listId, listId), isNull(registryEntries.removedAt)));
    },
    async entry(id) {
      mayView();
      const [row] = await db
        .select(ENTRY_ROW)
        .from(registryEntries)
        .where(eq(registryEntries.id, id));
      return row ?? null;
    },
    async addEntries(listId, rows) {
      mayEdit();
      if (rows.length === 0) return [];
      return db
        .insert(registryEntries)
        .values(rows.map((r) => ({ ...r, listId, addedAt: ctx.now })))
        .returning(ENTRY_ROW);
    },
    async updateEntry(id, expectedVersion, values) {
      mayEdit();
      const [row] = await db
        .update(registryEntries)
        .set({ ...values, version: bump })
        .where(
          and(
            eq(registryEntries.id, id),
            eq(registryEntries.version, expectedVersion),
            isNull(registryEntries.removedAt),
          ),
        )
        .returning(ENTRY_ROW);
      if (!row) throw new StaleVersion();
      return row satisfies RegistryEntryRecord;
    },
    async removeEntry(id) {
      mayEdit();
      const deleted = await db
        .delete(registryEntries)
        .where(
          and(
            eq(registryEntries.id, id),
            isNull(registryEntries.removedAt),
            isNull(registryEntries.firstPublishedIssueId),
          ),
        )
        .returning({ id: registryEntries.id });
      if (deleted.length > 0) return 'deleted';
      const archived = await db
        .update(registryEntries)
        .set({ removedAt: ctx.now, version: bump })
        .where(
          and(
            eq(registryEntries.id, id),
            isNull(registryEntries.removedAt),
            isNotNull(registryEntries.firstPublishedIssueId),
          ),
        )
        .returning({ id: registryEntries.id });
      return archived.length > 0 ? 'archived' : null;
    },
    async archiveLists(listIds, year) {
      mayArchive();
      const inLists = and(
        inArray(registryEntries.listId, [...listIds]),
        isNull(registryEntries.removedAt),
      );
      const deleted = await db
        .delete(registryEntries)
        .where(and(inLists, isNull(registryEntries.firstPublishedIssueId)))
        .returning({ id: registryEntries.id });
      const archived = await db
        .update(registryEntries)
        .set({ removedAt: ctx.now, archivedYear: year, version: bump })
        .where(and(inLists, isNotNull(registryEntries.firstPublishedIssueId)))
        .returning({ id: registryEntries.id });
      return { archived: archived.length, deleted: deleted.length };
    },
    async createList(key, values) {
      mayEdit();
      const [row] = await db
        .insert(registryLists)
        .values({
          ...values,
          key,
          purpose: 'point4',
          position: sql`(SELECT coalesce(max(${registryLists.position}), 0) + 1 FROM ${registryLists})`,
          createdAt: ctx.now,
          updatedAt: ctx.now,
        })
        .returning(LIST_ROW);
      if (!row) throw new Error('registry.createList: the insert returned no row');
      return row;
    },
    async updateList(id, expectedVersion, values) {
      mayEdit();
      const [row] = await db
        .update(registryLists)
        .set({ ...values, updatedAt: ctx.now, version: sql`${registryLists.version} + 1` })
        .where(and(eq(registryLists.id, id), eq(registryLists.version, expectedVersion)))
        .returning(LIST_ROW);
      if (!row) throw new StaleVersion();
      return row;
    },
    async orderLists(ids) {
      mayEdit();
      for (const [index, id] of ids.entries()) {
        await db
          .update(registryLists)
          .set({
            position: index + 1,
            updatedAt: ctx.now,
            version: sql`${registryLists.version} + 1`,
          })
          .where(eq(registryLists.id, id));
      }
    },
  };
}
