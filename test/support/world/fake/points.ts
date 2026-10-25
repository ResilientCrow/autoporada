import {
  DatabaseFailure,
  scopeOf,
  ScopeViolation,
  StaleVersion,
  type PointCursor,
  type PointRecord,
  type PointRepo,
  type Principal,
  type TxContext,
} from '@/application/ports';
import { parsePointJsonb } from '@/contracts';
import { admits } from '@/domain/policy';
import type { PointContent } from '@/domain/report';
import { isoWeekday, toIsoDate } from '@/domain/time';

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
  if ((row.kind === 'report') !== (row.typeId !== null)) throw refusedBy('points_kind_type');
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
  if (row.typeId !== null && !state.pointTypes.has(row.typeId)) {
    throw refusedBy('points_type_id_point_types_id_fk');
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

/** The point repository over the fake state, with the same scope, version and CHECK rules. */
export function fakePointRepo(tx: FakeTxState, ctx: TxContext): PointRepo {
  const { principal, now } = ctx;
  const { points } = tx.draft;
  const visible = pointReadable(principal);
  const find = (id: string) => {
    const point = points.get(id);
    return point && visible(point) ? record(point) : null;
  };
  const save = (row: FakePoint, before?: FakePoint) => {
    refuse(tx.draft, row, before);
    points.set(row.id, row);
    tx.written.push({ type: 'point', id: row.id });
    return record(row);
  };

  return {
    async create({ clientRef, kind, typeId, content }) {
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
        typeId,
        state: 'draft',
        content: checked,
        earliestMonday: null,
        submittedAt: null,
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
      const { content, state, earliestMonday, submittedAt } = patch;
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
        submittedAt: submittedAt ?? before.submittedAt,
        version: before.version + 1,
        updatedAt: now,
      };
      return save(after, before);
    },
    async listMine(limit, before) {
      guard(tx, false);
      if (principal.kind !== 'user') throw new ScopeViolation();
      // Ties go to the higher id; lowercase uuid text compares as PostgreSQL compares uuids.
      const newer = (a: PointCursor, b: PointCursor) =>
        b.updatedAt.getTime() - a.updatedAt.getTime() || (a.id < b.id ? 1 : -1);
      return [...points.values()]
        .filter((p) => admits({ kind: 'own', userId: principal.actor.id }, { ownerId: p.authorId }))
        .filter((p) => !before || newer(p, before) > 0)
        .sort(newer)
        .slice(0, limit)
        .map((p) => ({
          id: p.id,
          kind: p.kind,
          typeId: p.typeId,
          state: p.state,
          title: p.content.title,
          eventDate: p.content.eventDate,
          earliestMonday: p.earliestMonday,
          submittedAt: p.submittedAt,
          version: p.version,
          updatedAt: p.updatedAt,
        }));
    },
  };
}
