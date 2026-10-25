import { asc, eq } from 'drizzle-orm';

import { DatabaseFailure, type PointTypeRecord, type PointTypeRepo } from '@/application/ports';
import { defaultBulletsSchema } from '@/contracts';

import { pointTypes } from '../schema';
import type { TxDatabase } from './database';

const TYPE_ROW = {
  id: pointTypes.id,
  name: pointTypes.name,
  titleGender: pointTypes.titleGender,
  defaultBullets: pointTypes.defaultBullets,
  active: pointTypes.active,
  locked: pointTypes.locked,
  position: pointTypes.position,
  version: pointTypes.version,
};

type PointTypeRow = Pick<typeof pointTypes.$inferSelect, keyof typeof TYPE_ROW>;

/** The failure code of a stored row the contract refuses; it never carries the payload (ADR 0015). */
const PARSE_FAILURE = 'db.parse.point_types';

function toRecord(row: PointTypeRow): PointTypeRecord {
  const bullets = defaultBulletsSchema.safeParse(row.defaultBullets);
  if (!bullets.success) throw new DatabaseFailure(PARSE_FAILURE);
  return { ...row, defaultBullets: bullets.data };
}

export function createPointTypeRepo(db: TxDatabase): PointTypeRepo {
  return {
    async list() {
      const rows = await db
        .select(TYPE_ROW)
        .from(pointTypes)
        .orderBy(asc(pointTypes.position), asc(pointTypes.id));
      return rows.map(toRecord);
    },
    async get(id) {
      const [row] = await db.select(TYPE_ROW).from(pointTypes).where(eq(pointTypes.id, id));
      return row ? toRecord(row) : null;
    },
  };
}
