import {
  ConstraintViolation,
  ScopeViolation,
  StaleVersion,
  type RegistryEntryRecord,
  type RegistryEntryValues,
  type RegistryListRecord,
  type RegistryRepo,
  type TxContext,
} from '@/application/ports';
import { can } from '@/domain/policy';

import { guard, refusedBy } from './guards';
import { newId, type FakeTxState } from './state';

const within = (text: string, max: number) => [...text].length >= 1 && [...text].length <= max;

/** The registry repositories over the fake state, with the CHECKs and unique indexes of migration 0031. */
export function fakeRegistryRepo(tx: FakeTxState, ctx: TxContext): RegistryRepo {
  const { principal } = ctx;
  const { registryLists: lists, registryEntries: entries } = tx.draft;
  const policy = (action: 'registry.view' | 'registry.edit') => {
    if (principal.kind === 'user' && !can(principal.actor, { action })) throw new ScopeViolation();
  };
  const active = (listId: string) =>
    [...entries.values()].filter((e) => e.listId === listId && e.removedAt === null);
  const sameStudent = (a: RegistryEntryValues, b: RegistryEntryValues) =>
    a.familyName === b.familyName && a.givenName === b.givenName && a.classCode === b.classCode;
  /** An entry's CHECK and unique index; `others` are the active entries it must differ from. */
  const checkEntry = (e: RegistryEntryRecord, others: readonly RegistryEntryRecord[]) => {
    if (!within(e.givenName, 60) || !within(e.familyName, 60) || !within(e.classCode, 8)) {
      throw refusedBy('registry_entries_lengths');
    }
    if (e.removedAt === null && others.some((o) => o.id !== e.id && sameStudent(o, e))) {
      throw new ConstraintViolation('registry_entries_active_key');
    }
  };
  /** A list's CHECKs and uniques, in the order PostgreSQL reports them. */
  const checkList = (l: RegistryListRecord) => {
    const others = [...lists.values()].filter((o) => o.id !== l.id);
    if (others.some((o) => o.key === l.key))
      throw new ConstraintViolation('registry_lists_key_key');
    if (others.some((o) => o.title === l.title)) {
      throw new ConstraintViolation('registry_lists_title_key');
    }
    if (!/^[a-z0-9-]{1,40}$/.test(l.key)) throw refusedBy('registry_lists_key');
    if (!within(l.title, 120) || !within(l.docLabel, 300))
      throw refusedBy('registry_lists_lengths');
    if (l.purpose === 'annex1' && !l.active) throw refusedBy('registry_lists_annex1_active');
    if (l.purpose === 'annex1' && others.some((o) => o.purpose === 'annex1')) {
      throw refusedBy('registry_lists_one_annex1');
    }
    lists.set(l.id, l);
    tx.written.push({ type: 'registry_list', id: l.id });
    return l;
  };
  const byPosition = () =>
    [...lists.values()].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  return {
    async lists() {
      guard(tx, false);
      policy('registry.view');
      return byPosition();
    },
    async list(id) {
      guard(tx, false);
      policy('registry.view');
      return lists.get(id) ?? null;
    },
    async counts() {
      guard(tx, false);
      policy('registry.view');
      return [...lists.keys()].flatMap((listId) => {
        const rows = active(listId);
        const fresh = rows.filter((e) => e.firstPublishedIssueId === null).length;
        return rows.length > 0 ? [{ listId, active: rows.length, fresh }] : [];
      });
    },
    async entries(listId) {
      guard(tx, false);
      policy('registry.view');
      return active(listId);
    },
    async entry(id) {
      guard(tx, false);
      policy('registry.view');
      return entries.get(id) ?? null;
    },
    async addEntries(listId, rows) {
      guard(tx, true);
      policy('registry.edit');
      // One statement: all rows or none, so the draft is only written when every row passes.
      const added: RegistryEntryRecord[] = [];
      for (const values of rows) {
        const record: RegistryEntryRecord = {
          ...values,
          id: newId(tx.draft),
          listId,
          addedAt: ctx.now,
          removedAt: null,
          archivedYear: null,
          firstPublishedIssueId: null,
          version: 1,
        };
        if (!lists.has(listId)) throw refusedBy('registry_entries_list_id_registry_lists_id_fk');
        checkEntry(record, [...active(listId), ...added]);
        added.push(record);
      }
      for (const record of added) {
        entries.set(record.id, record);
        tx.written.push({ type: 'registry_entry', id: record.id });
      }
      return added;
    },
    async updateEntry(id, expectedVersion, values) {
      guard(tx, true);
      policy('registry.edit');
      const current = entries.get(id);
      if (!current || current.version !== expectedVersion || current.removedAt !== null) {
        throw new StaleVersion();
      }
      const next = { ...current, ...values, version: current.version + 1 };
      checkEntry(next, active(current.listId));
      entries.set(id, next);
      tx.written.push({ type: 'registry_entry', id });
      return next;
    },
    async removeEntry(id) {
      guard(tx, true);
      policy('registry.edit');
      const current = entries.get(id);
      if (!current || current.removedAt !== null) return null;
      tx.written.push({ type: 'registry_entry', id });
      if (current.firstPublishedIssueId === null) {
        entries.delete(id);
        return 'deleted';
      }
      entries.set(id, { ...current, removedAt: ctx.now, version: current.version + 1 });
      return 'archived';
    },
    async stampPublished(issueId, entryIds) {
      guard(tx, true);
      if (principal.kind === 'user' && !can(principal.actor, { action: 'issue.generate' })) {
        throw new ScopeViolation();
      }
      const stamped: string[] = [];
      for (const id of entryIds) {
        const entry = entries.get(id);
        if (!entry || entry.firstPublishedIssueId !== null) continue;
        entries.set(id, { ...entry, firstPublishedIssueId: issueId, version: entry.version + 1 });
        tx.written.push({ type: 'registry_entry', id });
        stamped.push(id);
      }
      return stamped;
    },
    async archiveLists(listIds, year) {
      guard(tx, true);
      if (
        principal.kind === 'user' &&
        !can(principal.actor, { action: 'registry.newSchoolYear' })
      ) {
        throw new ScopeViolation();
      }
      const archived: string[] = [];
      const deleted: string[] = [];
      for (const entry of [...entries.values()]) {
        if (!listIds.includes(entry.listId) || entry.removedAt !== null) continue;
        tx.written.push({ type: 'registry_entry', id: entry.id });
        if (entry.firstPublishedIssueId === null) {
          entries.delete(entry.id);
          deleted.push(entry.id);
        } else {
          entries.set(entry.id, {
            ...entry,
            removedAt: ctx.now,
            archivedYear: year,
            version: entry.version + 1,
          });
          archived.push(entry.id);
        }
      }
      return { archived, deleted };
    },
    async createList(key, values) {
      guard(tx, true);
      policy('registry.edit');
      const last = Math.max(0, ...[...lists.values()].map((l) => l.position));
      return checkList({
        ...values,
        id: newId(tx.draft),
        key,
        purpose: 'point4',
        position: last + 1,
        version: 1,
      });
    },
    async updateList(id, expectedVersion, values) {
      guard(tx, true);
      policy('registry.edit');
      const current = lists.get(id);
      if (!current || current.version !== expectedVersion) throw new StaleVersion();
      return checkList({ ...current, ...values, version: current.version + 1 });
    },
  };
}
