import {
  ConstraintViolation,
  ScopeViolation,
  StaleVersion,
  type PointTypeRecord,
  type PointTypeRepo,
  type TxContext,
} from '@/application/ports';
import { can } from '@/domain/policy';

import { guard, refusedBy } from './guards';
import { newId, type FakeTxState } from './state';

/** The point type repository over the fake state; `position` orders, the id breaks ties as in SQL. */
export function fakePointTypeRepo(tx: FakeTxState, ctx: TxContext): PointTypeRepo {
  const { principal } = ctx;
  const { pointTypes } = tx.draft;
  /** The writes' checks: the policy (ADR 0011), then the unique name and the locked CHECK as the database has them. */
  const checked = (record: PointTypeRecord) => {
    if (principal.kind === 'user' && !can(principal.actor, { action: 'pointTypes.manage' })) {
      throw new ScopeViolation();
    }
    const clash = [...pointTypes.values()].some(
      (t) => t.id !== record.id && t.name === record.name,
    );
    if (clash) throw new ConstraintViolation('point_types_name_key');
    if (record.locked && !record.active) throw refusedBy('point_types_locked_active');
    pointTypes.set(record.id, record);
    tx.written.push({ type: 'point_type', id: record.id });
    return record;
  };
  return {
    async list() {
      guard(tx, false);
      return [...pointTypes.values()].sort(
        (a, b) => a.position - b.position || a.id.localeCompare(b.id),
      );
    },
    async get(id) {
      guard(tx, false);
      return pointTypes.get(id) ?? null;
    },
    async create(values) {
      guard(tx, true);
      return checked({ ...values, id: newId(tx.draft), locked: false, version: 1 });
    },
    async update(id, expectedVersion, values) {
      guard(tx, true);
      const current = pointTypes.get(id);
      if (!current || current.version !== expectedVersion) throw new StaleVersion();
      return checked({ ...current, ...values, version: current.version + 1 });
    },
  };
}
