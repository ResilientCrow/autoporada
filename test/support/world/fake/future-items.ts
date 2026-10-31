import {
  DatabaseFailure,
  futureReviewScopeOf,
  futureWriteScopeOf,
  scopeOf,
  ScopeViolation,
  StaleVersion,
  type EndingAkce,
  type FutureContent,
  type FutureCursor,
  type FutureItemRecord,
  type FutureItemRepo,
  type Principal,
  type TxContext,
} from '@/application/ports';
import { parseResponsible } from '@/contracts';
import { admits, type Scope } from '@/domain/policy';
import { compareDates, toIsoDate, type CalDate } from '@/domain/time';

import { codePoints, distinctSorted, newestFirst } from './events';
import { guard, refusedBy } from './guards';
import { newId, type FakeFutureItem, type FakeState, type FakeTxState } from './state';

/** An akce as the late-report mails read it; none while it has no date. */
function endingOf(item: FakeFutureItem): EndingAkce | null {
  const lastDay = item.content.endDate ?? item.content.startDate;
  if (lastDay === null) return null;
  return {
    id: item.id,
    authorId: item.authorId,
    state: item.state,
    expectsReport: item.content.expectsReport,
    reportState: item.reportState,
    lastDay,
    timeTo: item.content.timeTo,
  };
}

/**
 * What migrations 0019 and 0020 refuse, in PostgreSQL's order: the CHECKs by name, then the
 * foreign key. future_items_campus cannot be hit through the typed port, and nor can
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
  if (row.reportState !== 'none' && !c.expectsReport) {
    throw refusedBy('future_items_report_needs_expect');
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

/** Whether the principal may read the item's history: the fake of `reviewableFutureItems`. */
export const futureReviewable = (principal: Principal) => admitted(futureReviewScopeOf(principal));

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

/** `list`'s order: last changed first, ties to the higher id (uuid text compares as PostgreSQL's uuids). */
const newer = (a: FutureCursor, b: FutureCursor) =>
  b.updatedAt.getTime() - a.updatedAt.getTime() || (a.id < b.id ? 1 : -1);

/** The future item repository over the fake state, with the same scope, version and CHECK rules. */
export function fakeFutureItemRepo(tx: FakeTxState, ctx: TxContext): FutureItemRepo {
  const { principal, now } = ctx;
  const { futureItems } = tx.draft;
  const visible = futureReadable(principal);
  const writable = admitted(futureWriteScopeOf(principal));
  const reviewable = futureReviewable(principal);
  /** `forIssue`'s order: the earliest start first, ties to the lower id. */
  const reaching = (state: 'approved' | 'submitted', meetingDate: CalDate) =>
    [...futureItems.values()]
      .filter((item) => {
        const last = item.content.endDate ?? item.content.startDate;
        return (
          visible(item) &&
          item.state === state &&
          last !== null &&
          compareDates(last, meetingDate) >= 0
        );
      })
      .sort(
        (a, b) =>
          compareDates(a.content.startDate ?? meetingDate, b.content.startDate ?? meetingDate) ||
          (a.id < b.id ? -1 : 1),
      )
      .map(record);
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
    async loadForDecision(id) {
      guard(tx, true);
      return find(id, reviewable);
    },
    async update(id, expectedVersion, { content, state, submittedAt, reportState, reportPointId }) {
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
        reportState: reportState ?? before.reportState,
        reportPointId: reportPointId ?? before.reportPointId,
        version: before.version + 1,
        updatedAt: now,
      });
    },
    async decide(id, expectedVersion, state) {
      guard(tx, true);
      const before = futureItems.get(id);
      if (!before || !reviewable(before) || before.version !== expectedVersion) {
        throw new StaleVersion();
      }
      return save({ ...before, state, version: before.version + 1, updatedAt: now });
    },
    async queue(limit) {
      guard(tx, false);
      const events = [...tx.draft.futureEvents.values()].sort(newestFirst);
      return [...futureItems.values()]
        .filter((item) => item.state === 'submitted' && visible(item))
        .sort(
          (a, b) =>
            (a.submittedAt?.getTime() ?? 0) - (b.submittedAt?.getTime() ?? 0) ||
            (a.id < b.id ? -1 : 1),
        )
        .slice(0, limit)
        .map((item) => ({
          item: record(item),
          revised: events.find((e) => e.futureItemId === item.id)?.event === 'revise',
        }));
    },
    async list(limit, before) {
      guard(tx, false);
      return [...futureItems.values()]
        .filter((item) => visible(item) && (!before || newer(item, before) > 0))
        .sort(newer)
        .slice(0, limit)
        .map(record);
    },
    async reportPromptDue({ from, to }) {
      guard(tx, false);
      if (principal.kind !== 'system') throw new ScopeViolation();
      return [...futureItems.values()]
        .flatMap((item) => {
          const lastDay = item.content.endDate ?? item.content.startDate;
          const due =
            item.state === 'approved' &&
            item.content.expectsReport &&
            item.reportState === 'none' &&
            lastDay !== null &&
            compareDates(lastDay, from) >= 0 &&
            compareDates(lastDay, to) <= 0;
          return due ? [{ id: item.id, authorId: item.authorId, lastDay }] : [];
        })
        .sort((a, b) => (a.id < b.id ? -1 : 1));
    },
    async reportsEnding({ from, to }) {
      guard(tx, false);
      if (principal.kind !== 'system') throw new ScopeViolation();
      return [...futureItems.values()]
        .flatMap((item) => {
          const ending = endingOf(item);
          return item.state === 'approved' &&
            item.content.expectsReport &&
            (item.reportState === 'none' || item.reportState === 'prompted') &&
            item.reportPointId === null &&
            ending &&
            compareDates(ending.lastDay, from) >= 0 &&
            compareDates(ending.lastDay, to) <= 0
            ? [ending]
            : [];
        })
        .sort((a, b) => (a.id < b.id ? -1 : 1));
    },
    async reportEnding(id) {
      guard(tx, false);
      if (principal.kind !== 'system') throw new ScopeViolation();
      const item = futureItems.get(id);
      return (item && endingOf(item)) ?? null;
    },
    async mailFacts(id) {
      guard(tx, false);
      if (principal.kind !== 'system') throw new ScopeViolation();
      const item = futureItems.get(id);
      return item
        ? { id: item.id, authorId: item.authorId, state: item.state, reportState: item.reportState }
        : null;
    },
    async submitterIds(since) {
      guard(tx, false);
      if (principal.kind !== 'system') throw new ScopeViolation();
      const handedIn = [...futureItems.values()].filter(
        (item) => item.submittedAt && item.submittedAt >= since,
      );
      return distinctSorted(handedIn.map((item) => item.authorId));
    },
    async countSubmittedSince({ since, notBy }) {
      guard(tx, false);
      if (principal.kind !== 'system') throw new ScopeViolation();
      return [...futureItems.values()].filter(
        (item) =>
          item.state === 'submitted' &&
          item.submittedAt &&
          item.submittedAt > since &&
          item.authorId !== notBy,
      ).length;
    },
    async forIssue(meetingDate) {
      guard(tx, false);
      return reaching('approved', meetingDate);
    },
    async waitingFor(meetingDate) {
      guard(tx, false);
      return reaching('submitted', meetingDate);
    },
    async awaitingReport({ from, to }) {
      guard(tx, false);
      return reaching('approved', from).filter((item) => {
        const last = item.content.endDate ?? item.content.startDate;
        return (
          item.content.expectsReport &&
          (item.reportState === 'none' || item.reportState === 'prompted') &&
          item.reportPointId === null &&
          last !== null &&
          compareDates(last, to) <= 0
        );
      });
    },
  };
}
