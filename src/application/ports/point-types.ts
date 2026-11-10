import type { TitleGender } from '@/domain/cs';
import type { BulletSpec } from '@/domain/report';

/** A point type: what a report is about, with the bullets a new draft starts with. */
export interface PointTypeRecord {
  readonly id: string;
  readonly name: string;
  /** Null until an admin chooses one. */
  readonly titleGender: TitleGender | null;
  readonly defaultBullets: readonly BulletSpec[];
  readonly active: boolean;
  /** The type that always stays on offer („Jiné“); it cannot be switched off. */
  readonly locked: boolean;
  readonly position: number;
  readonly version: number;
}

/** What an admin sets on a type; `locked` and the version are not theirs to set. */
export type PointTypeValues = Pick<
  PointTypeRecord,
  'name' | 'titleGender' | 'defaultBullets' | 'active' | 'position'
>;

/** Point types. Rows are not personal data: every principal may read them; only the headmaster writes. */
export interface PointTypeRepo {
  /** Every type, inactive ones too, in `position` order. */
  list(): Promise<readonly PointTypeRecord[]>;
  /** The type, or null for an unknown id. */
  get(id: string): Promise<PointTypeRecord | null>;
  /**
   * A new, unlocked type at version 1. ConstraintViolation(`point_types_name_key`) for a name in
   * use; ScopeViolation for a user who may not `pointTypes.manage`.
   */
  create(values: PointTypeValues): Promise<PointTypeRecord>;
  /**
   * Sets the values against the version the admin saw and raises it by one; `locked` stays.
   * StaleVersion for another version or an unknown id; the same violations as `create`.
   */
  update(id: string, expectedVersion: number, values: PointTypeValues): Promise<PointTypeRecord>;
  /**
   * Deletes the type at the version the admin saw. StaleVersion for another version or an unknown
   * id; ConstraintViolation(`points_type_id_point_types_id_fk`) while a point uses it;
   * ScopeViolation as `create`.
   */
  remove(id: string, expectedVersion: number): Promise<void>;
}
