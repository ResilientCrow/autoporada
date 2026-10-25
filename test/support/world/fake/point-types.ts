import type { PointTypeRepo } from '@/application/ports';

import { guard } from './guards';
import type { FakeTxState } from './state';

/** The point type repository over the fake state; `position` orders, the id breaks ties as in SQL. */
export function fakePointTypeRepo(tx: FakeTxState): PointTypeRepo {
  const { pointTypes } = tx.draft;
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
  };
}
