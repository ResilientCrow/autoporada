import type { Campus, ParticipantsAddress, PersonHead, Salutation } from '@/domain/cs';
import type { RichDoc } from '@/domain/richtext';
import type { CalDate, WallTime } from '@/domain/time';

/** What a point is about: a report on an event, a finance proposal or a directive. */
export type PointKind = 'report' | 'finance' | 'pokyn';

/** A finance or pokyn proposal: a point of either kind has a title and a text, and no type. */
export type ProposalKind = Exclude<PointKind, 'report'>;
export const PROPOSAL_KINDS: readonly ProposalKind[] = ['finance', 'pokyn'];

/** A person as the author typed or picked them; the salutation is chosen by hand. */
export interface DraftPerson {
  /** Entra object id from a directory hit; dedupe only, grants nothing. */
  readonly graphId?: string;
  /** `null` until the author picks one. */
  readonly salutation: Salutation | null;
  readonly titlesBefore?: string;
  readonly givenName: string;
  readonly familyName: string;
  readonly titlesAfter?: string;
  /**
   * The noun that prints with the salutation, copied when the author picked the person (ADR 0072
   * item 7): „pan profesor Jan Novák“, „zástupkyně pro majetek paní Jana Nováková“ (a function goes
   * first, ADR 0073). A head needs a salutation.
   */
  readonly head?: PersonHead;
  /** After the head noun, never declined; one line. */
  readonly complement?: string;
  /** „3.B“ or an employer. */
  readonly affiliation?: string;
  /** The school year in which the class was confirmed („2026/2027“). */
  readonly affiliationYear?: string;
}

export type DraftBullet =
  | {
      readonly key: string;
      readonly label: string;
      readonly kind: 'people';
      readonly order: 'input' | 'class-surname';
      readonly people: readonly DraftPerson[];
      /**
       * How the people of the `participants` row are addressed as a group (ADR 0071); no other row
       * has one. Null (or absent) until the author chooses, and for a row saved before it existed.
       * With one, the people need no salutation of their own.
       */
      readonly address?: ParticipantsAddress | null;
    }
  | {
      readonly key: string;
      readonly label: string;
      readonly kind: 'text';
      readonly text: string;
    };

export interface DraftStatement {
  readonly speaker: DraftPerson | null;
  /** The speaker in the genitive („ředitele školy“), as the author last left it. */
  readonly speakerGenitive: string;
  readonly affiliation?: string;
  readonly quote: string;
}

/** A row a new report starts with (`REPORT_BULLETS`); the draft's bullets start as copies of these. */
export interface BulletSpec {
  readonly key: string;
  readonly label: string;
  readonly kind: 'people' | 'text';
  readonly required: boolean;
}

/** The text and structure of a point, as the editor and the preview see it. */
export interface PointContent {
  readonly title: string;
  readonly eventDate: CalDate | null;
  /** Last day of a multi-day event. */
  readonly endDate: CalDate | null;
  readonly timeFrom: WallTime | null;
  readonly timeTo: WallTime | null;
  readonly campus: Campus | null;
  /** As typed: „místnost S205“ or „na Pražském hradě“; the opening reads it (ADR 0069). */
  readonly place: string | null;
  readonly opening: string;
  /** Once true, a change in the fields never overwrites `opening`. */
  readonly openingEdited: boolean;
  readonly body: RichDoc;
  readonly bullets: readonly DraftBullet[];
  readonly statements: readonly DraftStatement[];
}
