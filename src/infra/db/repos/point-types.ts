import { and, asc, eq, sql } from 'drizzle-orm';

import {
  DatabaseFailure,
  ScopeViolation,
  StaleVersion,
  type PointTypeRecord,
  type PointTypeRepo,
  type TxContext,
} from '@/application/ports';
import { defaultBulletsSchema } from '@/contracts';
import { can } from '@/domain/policy';

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

export function createPointTypeRepo(db: TxDatabase, ctx: TxContext): PointTypeRepo {
  const { principal } = ctx;
  /** Privileged writes re-check the policy, whatever the use case declared (ADR 0011). */
  const mayManage = () => {
    if (principal.kind === 'user' && !can(principal.actor, { action: 'pointTypes.manage' })) {
      throw new ScopeViolation();
    }
  };
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
    async create(values) {
      mayManage();
      const [row] = await db
        .insert(pointTypes)
        .values({
          ...values,
          defaultBullets: [...values.defaultBullets],
          createdAt: ctx.now,
          updatedAt: ctx.now,
        })
        .returning(TYPE_ROW);
      if (!row) throw new Error('pointTypes.create: the insert returned no row');
      return toRecord(row);
    },
    async update(id, expectedVersion, values) {
      mayManage();
      const [row] = await db
        .update(pointTypes)
        .set({
          ...values,
          defaultBullets: [...values.defaultBullets],
          updatedAt: ctx.now,
          version: sql`${pointTypes.version} + 1`,
        })
        .where(and(eq(pointTypes.id, id), eq(pointTypes.version, expectedVersion)))
        .returning(TYPE_ROW);
      if (!row) throw new StaleVersion();
      return toRecord(row);
    },
  };
}
