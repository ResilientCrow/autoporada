import type { RichDoc } from '@/domain/richtext';
import type { CalDate } from '@/domain/time';

/** Slots the document generates itself; they keep their place from issue to issue. */
export type SystemSlot = 'meetings' | 'events' | 'talent' | 'exemptions' | 'media' | 'partners';

export type OutlineSection = 'pokyny' | 'hospodareni';

/** „vyjádření pana …: „…““ of the partners slot; the speaker is stored in the 2nd case. */
export interface Statement {
  readonly speakerGenitive: string;
  readonly affiliation?: string;
  readonly quote: string;
}

export interface OutlineRow {
  /** Names the item across issues; a proposal row uses its point id. */
  readonly lineageId: string;
  readonly section: OutlineSection;
  readonly slot: SystemSlot | null;
  readonly persistence: 'standing' | 'once';
  /** Null on a proposal row: title and body are read from the point. */
  readonly title: string | null;
  readonly body: RichDoc | null;
  readonly quotes: readonly Statement[];
  readonly sourcePointId: string | null;
  /** A newly approved proposal nobody placed yet: shown at the end, written when moved. */
  readonly isNew?: true;
}

/** Array order is the position. */
export interface Outline {
  readonly pokyny: readonly OutlineRow[];
  readonly hospodareni: readonly OutlineRow[];
}

export type OutlineOrigin =
  | { readonly kind: 'stored' }
  | { readonly kind: 'derived'; readonly from: CalDate; readonly how: 'carry' }
  | { readonly kind: 'seed' };

export const SECTIONS: readonly OutlineSection[] = ['pokyny', 'hospodareni'];
