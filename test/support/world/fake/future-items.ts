import {
  DatabaseFailure,
  futureHistoryScopeOf,
  futureWriteScopeOf,
  scopeOf,
  ScopeViolation,
  StaleVersion,
  type FutureContent,
  type FutureItemRecord,
  type FutureItemRepo,
  type Principal,
  type TxContext,
} from '@/application/ports';
import { parseResponsible } from '@/contracts';
import { admits, type Scope } from '@/domain/policy';
import { toIsoDate } from '@/domain/time';

import { codePoints, newestFirst } from './events';
import { guard, refusedBy } from './guards';
import { newId, type FakeFutureItem, type FakeState, type FakeTxState } from './state';

/**
 * What migrations 0019 and 0020 refuse, in PostgreSQL's order: the CHECKs by name, then the
 * foreign key. future_items_campus cannot be hit through the typed port, and nor can
 * future_items_report_needs_expect, whose report state no port method writes yet, or
 * future_items_responsible, which the contract's parse (db.parse.future_items) refuses first.
 */
function refuse(state: FakeState, row: FakeFutureItem): void {
  const { content: c } = row;
  if (c.endDate && (!c.startDate || toIsoDate(c.endDate) < toIsoDate(c.startDate))) {
    throw refusedBy('future_items_dates');
  }
  if (c.expectsReport && row.kind !== 'akce') throw refusedBy('future_items_expects_akce');
  if (codePoints(c.title) > 200 || codePoints(c.place ?? '') > 120) {
    throw refusedBy('future_items_lengths');
  }
  const complete = c.title !== '' && c.startDate !== null && row.submittedAt !== null;
  if (['submitted', 'approved', 'cancelled'].includes(row.state) && !complete) {
    throw refusedBy('future_items_submitted_complete');
  }
  if (!state.users.has(row.authorId)) throw refusedBy('future_items_author_id_users_id_fk');
}

const admitted = (scope: Scope) => (item: FakeFutureItem) =>
  admits(scope, {
    ownerId: item.authorId,
    kind: item.kind,
    state: item.state,
    everSubmitted: item.submittedAt !== null,
  });

/** Whether the principal's read scope admits the item: the fake of `visibleFutureItems`. */
const futureReadable = (principal: Principal) => admitted(scopeOf(principal, 'futureItem'));

/** Whether the principal may read the item's history: the fake of `visibleFutureHistory`. */
export const futureHistoryReadable = (principal: Principal) =>
  admitted(futureHistoryScopeOf(principal));

const record = ({ clientRef: _ref, ...item }: FakeFutureItem): FutureItemRecord => item;

/**
 * As the repository: `responsible` goes through the contract's one parse before anything else,
 * and the jsonb keeps a copy, not the caller's object.
 */
function stored(content: FutureContent): FutureContent {
  const responsible = parseResponsible(content.responsible);
  if (!responsible) throw new DatabaseFailure('db.parse.future_items');
  return structuredClone({ ...content, responsible: responsible.value });
}

/** The future item repository over the fake state, with the same scope, version and CHECK rules. */
export function fakeFutureItemRepo(tx: FakeTxState, ctx: TxContext): FutureItemRepo {
  const { principal, now } = ctx;
  const { futureItems } = tx.draft;
  const visible = futureReadable(principal);
  const writable = admitted(futureWriteScopeOf(principal));
  const find = (id: string, mayUse: (item: FakeFutureItem) => boolean) => {
    const item = futureItems.get(id);
    return item && mayUse(item) ? record(item) : null;
  };
  const save = (row: FakeFutureItem) => {
    refuse(tx.draft, row);
    futureItems.set(row.id, row);
    tx.written.push({ type: 'future_item', id: row.id });
    return record(row);
  };

  return {
    async create({ clientRef, kind, content }) {
      guard(tx, true);
      if (principal.kind !== 'user') throw new ScopeViolation();
      const authorId = principal.actor.id;
      const values = stored(content);
      const existing = [...futureItems.values()].find(
        (i) => i.authorId === authorId && i.clientRef === clientRef,
      );
      if (existing) return { item: record(existing), inserted: false };
      const item = save({
        id: newId(tx.draft),
        kind,
        authorId,
        clientRef,
        state: 'draft',
        content: values,
        reportState: 'none',
        reportPointId: null,
        submittedAt: null,
        version: 1,
        updatedAt: now,
      });
      return { item, inserted: true };
    },
    async get(id) {
      guard(tx, false);
      return find(id, visible);
    },
    async loadForWrite(id) {
      // The fake runs one transaction at a time, which stands in for the row lock.
      guard(tx, true);
      return find(id, writable);
    },
    async update(id, expectedVersion, { content, state, submittedAt }) {
      guard(tx, true);
      const values = content && stored(content);
      const before = futureItems.get(id);
      if (!before || !writable(before) || before.version !== expectedVersion) {
        throw new StaleVersion();
      }
      return save({
        ...before,
        content: values ?? before.content,
        state: state ?? before.state,
        submittedAt: submittedAt === undefined ? before.submittedAt : submittedAt,
        version: before.version + 1,
        updatedAt: now,
      });
    },
    async list(limit) {
      guard(tx, false);
      return [...futureItems.values()]
        .filter(visible)
        .sort((a, b) =>
          newestFirst({ createdAt: a.updatedAt, id: a.id }, { createdAt: b.updatedAt, id: b.id }),
        )
        .slice(0, limit)
        .map(record);
    },
  };
}
