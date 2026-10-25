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

/** Point types. Rows are not personal data: every principal may read them. */
export interface PointTypeRepo {
  /** Every type, inactive ones too, in `position` order. */
  list(): Promise<readonly PointTypeRecord[]>;
  /** The type, or null for an unknown id. */
  get(id: string): Promise<PointTypeRecord | null>;
}
