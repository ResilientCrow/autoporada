import {
  scopeOf,
  ScopeViolation,
  StaleVersion,
  type FutureContent,
  type FutureItemRecord,
  type FutureItemRepo,
  type Principal,
  type TxContext,
} from '@/application/ports';
import { admits } from '@/domain/policy';
import { toIsoDate } from '@/domain/time';

import { codePoints, newestFirst } from './events';
import { guard, refusedBy } from './guards';
import { newId, type FakeFutureItem, type FakeState, type FakeTxState } from './state';

/**
 * What migrations 0019 and 0020 refuse, in PostgreSQL's order: the CHECKs by name, then the
 * foreign key. future_items_campus cannot be hit through the typed port, and nor can
 * future_items_report_needs_expect, whose report state no port method writes yet.
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

/** Whether the principal's read scope admits the item: the fake of `visibleFutureItems`. */
export const futureReadable =
  (principal: Principal) =>
  (item: FakeFutureItem): boolean =>
    admits(scopeOf(principal, 'futureItem'), {
      ownerId: item.authorId,
      kind: item.kind,
      state: item.state,
      everSubmitted: item.submittedAt !== null,
    });

const record = ({ clientRef: _ref, ...item }: FakeFutureItem): FutureItemRecord => item;

/** The jsonb keeps a copy, not the caller's object. */
const stored = (content: FutureContent): FutureContent => structuredClone(content);

/** The future item repository over the fake state, with the same scope, version and CHECK rules. */
export function fakeFutureItemRepo(tx: FakeTxState, ctx: TxContext): FutureItemRepo {
  const { principal, now } = ctx;
  const { futureItems } = tx.draft;
  const visible = futureReadable(principal);
  const find = (id: string) => {
    const item = futureItems.get(id);
    return item && visible(item) ? record(item) : null;
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
        content: stored(content),
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
      return find(id);
    },
    async loadForWrite(id) {
      // The fake runs one transaction at a time, which stands in for the row lock.
      guard(tx, true);
      return find(id);
    },
    async update(id, expectedVersion, { content, state, submittedAt }) {
      guard(tx, true);
      const before = futureItems.get(id);
      if (!before || !visible(before) || before.version !== expectedVersion) {
        throw new StaleVersion();
      }
      return save({
        ...before,
        content: content ? stored(content) : before.content,
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
