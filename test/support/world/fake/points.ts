import {
  DatabaseFailure,
  scopeOf,
  ScopeViolation,
  StaleVersion,
  type PointCursor,
  type PointEventRecord,
  type PointRecord,
  type PointRepo,
  type ReportPoint,
  type Principal,
  type TxContext,
} from '@/application/ports';
import { parsePointJsonb } from '@/contracts';
import { dueMonday, inIssue, isLateReport, lateFacts, type PoradaClose } from '@/domain/calendar';
import { admits, can } from '@/domain/policy';
import type { PointContent } from '@/domain/report';
import { POINT_MACHINE } from '@/domain/review';
import { compareDates, isoWeekday, toIsoDate, type CalDate } from '@/domain/time';

import { distinctSorted } from './events';
import { isOwedAkce } from './future-owed';
import { guard, refusedBy } from './guards';
import { newId, type FakePoint, type FakeState, type FakeTxState } from './state';

const codePoints = (text: string | null) => [...(text ?? '')].length;

/** As the repository: the jsonb goes through the contract's one parse before anything else. */
function parsed(content: PointContent): PointContent {
  const jsonb = parsePointJsonb(content);
  if (!jsonb) throw new DatabaseFailure('db.parse.points');
  return { ...content, ...jsonb };
}

/**
 * What migrations 0015 and 0016 refuse, in PostgreSQL's order: the BEFORE
 * trigger, the CHECKs by name, then the foreign keys. points_campus cannot be
 * hit through the typed port; points_content_size counts jsonb's own text
 * form, which only PostgreSQL has (test/integration/db/point-guards.test.ts).
 */
function refuse(state: FakeState, row: FakePoint, before?: FakePoint): void {
  const { content: c } = row;
  const fixed = before?.earliestMonday;
  if (fixed && (!row.earliestMonday || toIsoDate(fixed) !== toIsoDate(row.earliestMonday))) {
    throw refusedBy('points_earliest_fixed');
  }
  if (c.endDate && (!c.eventDate || toIsoDate(c.endDate) < toIsoDate(c.eventDate))) {
    throw refusedBy('points_dates');
  }
  if (row.handInMonday && isoWeekday(row.handInMonday) !== 1) {
    throw refusedBy('points_hand_in_monday');
  }
  if ((row.submittedAt === null) !== (row.handInMonday === null)) {
    throw refusedBy('points_hand_in_set');
  }
  if (codePoints(c.title) > 200 || codePoints(c.opening) > 1000 || codePoints(c.place) > 120) {
    throw refusedBy('points_lengths');
  }
  if (row.earliestMonday && isoWeekday(row.earliestMonday) !== 1) throw refusedBy('points_monday');
  const complete =
    c.title !== '' &&
    row.earliestMonday !== null &&
    row.submittedAt !== null &&
    (row.kind !== 'report' || (c.eventDate !== null && c.opening !== ''));
  if (['submitted', 'approved', 'published'].includes(row.state) && !complete) {
    throw refusedBy('points_submitted_complete');
  }
  if (!state.users.has(row.authorId)) throw refusedBy('points_author_id_users_id_fk');
  if (row.futureItemId !== null && !state.futureItems.has(row.futureItemId)) {
    throw refusedBy('points_future_item_id_future_items_id_fk');
  }
}

/** Whether the principal's read scope admits the point: the fake of `visiblePoints`. */
export const pointReadable =
  (principal: Principal) =>
  (p: FakePoint): boolean =>
    admits(scopeOf(principal, 'point'), {
      ownerId: p.authorId,
      state: p.state,
      everSubmitted: p.submittedAt !== null,
    });

const record = ({ clientRef: _ref, ...point }: FakePoint): PointRecord => point;

/** `listMine`'s order: last changed first, ties to the higher id (uuid text compares as PostgreSQL's uuids). */
const newer = (a: PointCursor, b: PointCursor) =>
  b.updatedAt.getTime() - a.updatedAt.getTime() || (a.id < b.id ? 1 : -1);

/** The note of the point's newest `return` event, in the events' order (PointEventRepo.list). */
const returnNoteOf = (tx: FakeTxState, pointId: string): string | null =>
  [...tx.draft.pointEvents.values()]
    .filter((e) => e.pointId === pointId && e.event === 'return')
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1))[0]
    ?.note ?? null;

/** The order handed in: the oldest submission first, ties to the lower id. */
const handedInFirst = (a: FakePoint, b: FakePoint) =>
  (a.submittedAt?.getTime() ?? 0) - (b.submittedAt?.getTime() ?? 0) || (a.id < b.id ? -1 : 1);

/** A report's last day: the end date, or else the event date (null without one). */
const lastDay = (p: FakePoint) => p.content.endDate ?? p.content.eventDate;

/** The point repository over the fake state, with the same scope, version and CHECK rules. */
/** True for a report that is late for the porada (`isLateReport`); the fake uses the domain's own rule. */
function isLate(p: FakePoint, porada: PoradaClose): boolean {
  const facts = p.kind === 'report' ? lateFacts(p.content) : undefined;
  return facts !== undefined && isLateReport(porada, facts);
}

/** A report point as the late-report jobs read it; none for another kind, a missing date or a dead point. */
function reportPointOf(p: FakePoint): ReportPoint[] {
  const { eventDate, endDate, timeTo } = p.content;
  if (
    p.kind !== 'report' ||
    eventDate === null ||
    p.state === 'withdrawn' ||
    p.state === 'rejected'
  ) {
    return [];
  }
  const lastDay = endDate ?? eventDate;
  return [
    {
      id: p.id,
      authorId: p.authorId,
      state: p.state,
      handInMonday: p.handInMonday,
      lastDay,
      timeTo,
    },
  ];
}

export function fakePointRepo(tx: FakeTxState, ctx: TxContext): PointRepo {
  const { principal, now } = ctx;
  const { points } = tx.draft;
  const visible = pointReadable(principal);
  /** Points in the order handed in, in the order handed in: the oldest submission first, ties to the lower id. */
  const handedIn = () => [...points.values()].sort(handedInFirst);
  const find = (id: string) => {
    const point = points.get(id);
    return point && visible(point) ? record(point) : null;
  };
  /** Report drafts ending in the window that no approved akce expecting a report is linked to. */
  const draftReportsIn = (from: CalDate, to: CalDate) =>
    [...points.values()].filter((p) => {
      const last = lastDay(p);
      return (
        p.kind === 'report' &&
        (p.state === 'draft' || p.state === 'returned') &&
        last !== null &&
        compareDates(last, from) >= 0 &&
        compareDates(last, to) <= 0 &&
        ![...tx.draft.futureItems.values()].some(
          (item) =>
            item.reportPointId === p.id && item.state === 'approved' && item.kind === 'akce',
        )
      );
    });
  /** The owed akce (approved, or revised back into review) that names the point as its report (ADR 0049): the akce decides its porada. */
  const owedAkceOf = (p: FakePoint) =>
    [...tx.draft.futureItems.values()].find(
      (item) => item.reportPointId === p.id && isOwedAkce(tx.draft, item),
    );
  const akceLastDay = (item: {
    readonly content: { endDate: CalDate | null; startDate: CalDate | null };
  }) => item.content.endDate ?? item.content.startDate;
  /** Whoever previews an issue reads where a point stands; so does the system. */
  const mayPreview = () => {
    if (principal.kind === 'user' && !can(principal.actor, { action: 'issue.preview' })) {
      throw new ScopeViolation();
    }
  };
  const mayGenerate = () => {
    if (principal.kind === 'user' && !can(principal.actor, { action: 'issue.generate' })) {
      throw new ScopeViolation();
    }
  };
  /** The user's own points, whatever the read scope; the system has none. */
  const own = () => {
    guard(tx, false);
    if (principal.kind !== 'user') throw new ScopeViolation();
    const userId = principal.actor.id;
    return [...points.values()].filter((p) =>
      admits({ kind: 'own', userId }, { ownerId: p.authorId }),
    );
  };
  const save = (row: FakePoint, before?: FakePoint) => {
    refuse(tx.draft, row, before);
    points.set(row.id, row);
    tx.written.push({ type: 'point', id: row.id });
    return record(row);
  };

  return {
    async create({ clientRef, kind, content, futureItemId }) {
      guard(tx, true);
      if (principal.kind !== 'user') throw new ScopeViolation();
      const authorId = principal.actor.id;
      const checked = parsed(content);
      const existing = [...points.values()].find(
        (p) => p.authorId === authorId && p.clientRef === clientRef,
      );
      if (existing) return { point: record(existing), inserted: false };
      const point = save({
        id: newId(tx.draft),
        kind,
        authorId,
        clientRef,
        futureItemId: futureItemId ?? null,
        state: 'draft',
        content: checked,
        earliestMonday: null,
        submittedAt: null,
        handInMonday: null,
        version: 1,
        updatedAt: now,
      });
      return { point, inserted: true };
    },
    async beginCreate(clientRef) {
      // The fake runs one transaction at a time, which stands in for the lock. It
      // writes nothing, and PostgreSQL takes an advisory lock in read mode too.
      guard(tx, false);
      if (principal.kind !== 'user') throw new ScopeViolation();
      const own = [...points.values()].filter((p) => p.authorId === principal.actor.id);
      const existing = own.find((p) => p.clientRef === clientRef);
      return {
        existing: existing ? record(existing) : null,
        drafts: own.filter((p) => p.state === 'draft').length,
      };
    },
    async beginSubmit() {
      guard(tx, false);
      if (principal.kind !== 'user') throw new ScopeViolation();
      const pending = [...points.values()].filter(
        (p) => p.authorId === principal.actor.id && p.state === 'submitted',
      );
      return { pending: pending.length };
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
    async update(id, expectedVersion, patch) {
      guard(tx, true);
      const { content, state, earliestMonday, submittedAt, handInMonday } = patch;
      const checked = content && parsed(content);
      const before = points.get(id);
      if (!before || !visible(before) || before.version !== expectedVersion) {
        throw new StaleVersion();
      }
      const after: FakePoint = {
        ...before,
        content: checked ?? before.content,
        state: state ?? before.state,
        earliestMonday: earliestMonday ?? before.earliestMonday,
        submittedAt: submittedAt === undefined ? before.submittedAt : submittedAt,
        handInMonday: handInMonday === undefined ? before.handInMonday : handInMonday,
        version: before.version + 1,
        updatedAt: now,
      };
      return save(after, before);
    },
    async listMine(limit, before) {
      return own()
        .filter((p) => !before || newer(p, before) > 0)
        .sort(newer)
        .slice(0, limit)
        .map((p) => ({
          id: p.id,
          kind: p.kind,
          state: p.state,
          title: p.content.title,
          eventDate: p.content.eventDate,
          earliestMonday: p.earliestMonday,
          handInMonday: p.handInMonday,
          returnNote: p.state === 'returned' ? returnNoteOf(tx, p.id) : null,
          version: p.version,
          updatedAt: p.updatedAt,
        }));
    },
    async mailFacts(id) {
      guard(tx, false);
      if (principal.kind !== 'system') throw new ScopeViolation();
      const point = points.get(id);
      return point ? { id: point.id, authorId: point.authorId, state: point.state } : null;
    },
    async reportPoints({ from, to }) {
      guard(tx, false);
      if (principal.kind !== 'system') throw new ScopeViolation();
      return [...points.values()]
        .flatMap(reportPointOf)
        .filter((p) => compareDates(p.lastDay, from) >= 0 && compareDates(p.lastDay, to) <= 0)
        .sort((a, b) => (a.id < b.id ? -1 : 1));
    },
    async reportPoint(id) {
      guard(tx, false);
      if (principal.kind !== 'system') throw new ScopeViolation();
      const point = points.get(id);
      return (point && reportPointOf(point)[0]) ?? null;
    },
    async reminderAuthors({ draftsSince, monday, meetingDate, deadlineAt }) {
      guard(tx, false);
      if (principal.kind !== 'system') throw new ScopeViolation();
      const waiting = [...points.values()].filter(
        (p) =>
          ((p.state === 'draft' && p.updatedAt >= draftsSince) ||
            (p.state === 'returned' &&
              p.earliestMonday !== null &&
              compareDates(p.earliestMonday, monday) <= 0)) &&
          !isLate(p, { meetingDate, deadlineAt }),
      );
      return distinctSorted(waiting.map((p) => p.authorId));
    },
    async handedInFor(monday) {
      guard(tx, false);
      if (principal.kind !== 'system') throw new ScopeViolation();
      return [...points.values()].flatMap((p) =>
        (p.state === 'submitted' || p.state === 'approved' || p.state === 'returned') &&
        p.earliestMonday !== null &&
        p.handInMonday !== null &&
        compareDates(p.earliestMonday, monday) <= 0
          ? [{ state: p.state, earliestMonday: p.earliestMonday, handInMonday: p.handInMonday }]
          : [],
      );
    },
    async countSubmittedSince({ since, notBy }) {
      guard(tx, false);
      if (principal.kind !== 'system') throw new ScopeViolation();
      return [...points.values()].filter(
        (p) =>
          p.state === 'submitted' && p.submittedAt && p.submittedAt > since && p.authorId !== notBy,
      ).length;
    },
    async eligibleFor(monday, meetingDate, { since }) {
      guard(tx, false);
      return handedIn()
        .filter((p) => {
          const akce = owedAkceOf(p);
          if (akce) {
            // ADR 0049: the akce decides the porada, whatever the hand-in Monday.
            const last = akceLastDay(akce);
            return (
              visible(p) &&
              p.state === 'approved' &&
              last !== null &&
              compareDates(last, since) >= 0 &&
              compareDates(last, meetingDate) < 0
            );
          }
          return (
            visible(p) &&
            inIssue(
              {
                state: p.state,
                kind: p.kind,
                earliest: p.earliestMonday ?? monday,
                handIn: p.handInMonday ?? monday,
                lastDay: lastDay(p),
              },
              { monday, meetingDate },
            ) &&
            p.earliestMonday !== null &&
            p.handInMonday !== null
          );
        })
        .map(record);
    },
    async statesOf(ids) {
      guard(tx, false);
      mayPreview();
      return ids.flatMap((id) => {
        const p = points.get(id);
        return p ? [{ id: p.id, state: p.state, version: p.version }] : [];
      });
    },
    async close(id, expectedVersion) {
      guard(tx, true);
      mayGenerate();
      const before = points.get(id);
      if (
        !before ||
        before.version !== expectedVersion ||
        !POINT_MACHINE.close.from.includes(before.state)
      ) {
        throw new StaleVersion();
      }
      const moved = save({
        ...before,
        state: POINT_MACHINE.close.to,
        version: before.version + 1,
        updatedAt: now,
      });
      const event: PointEventRecord = {
        id: newId(tx.draft),
        pointId: id,
        actorId: principal.kind === 'user' ? principal.actor.id : null,
        event: 'close',
        fromState: before.state,
        toState: moved.state,
        note: null,
        returnParts: null,
        editedFields: null,
        before: null,
        createdAt: now,
      };
      tx.draft.pointEvents.set(event.id, event);
      return { id, from: before.state, version: moved.version };
    },
    async draftReports({ from, to }) {
      guard(tx, false);
      return draftReportsIn(from, to)
        .filter(visible)
        .sort((a, b) => (a.id < b.id ? -1 : 1))
        .map(record);
    },
    async draftReportFacts({ from, to }) {
      guard(tx, false);
      return draftReportsIn(from, to)
        .sort((a, b) => (a.id < b.id ? -1 : 1))
        .flatMap((p) => {
          const last = lastDay(p);
          return last === null ? [] : [{ id: p.id, lastDay: last, timeTo: p.content.timeTo }];
        });
    },
    async waitingFor(monday, meetingDate) {
      guard(tx, false);
      const due = handedIn().filter(
        (p) =>
          visible(p) &&
          p.earliestMonday !== null &&
          p.handInMonday !== null &&
          compareDates(dueMonday({ earliest: p.earliestMonday, handIn: p.handInMonday }), monday) <=
            0,
      );
      const refs = (keep: (p: FakePoint) => boolean) =>
        due.filter(keep).map(({ id, kind, content }) => ({ id, kind, title: content.title }));
      return {
        submitted: refs((p) => p.state === 'submitted'),
        returned: refs((p) => p.state === 'returned'),
        later: refs((p) => {
          const akce = owedAkceOf(p);
          const last = akce ? akceLastDay(akce) : lastDay(p);
          return (
            p.state === 'approved' &&
            p.kind === 'report' &&
            (last === null || compareDates(last, meetingDate) >= 0)
          );
        }),
      };
    },
  };
}
