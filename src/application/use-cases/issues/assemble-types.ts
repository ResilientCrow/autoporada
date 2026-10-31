import type { PointRef } from '@/application/ports';
import type { OutlineOrigin } from '@/domain/outline';
import type { IssueStatus, PointState } from '@/domain/review';
import type { CalDate } from '@/domain/time';
import type { IssueSnapshot } from '@/snapshot';

/** What the assembler left out or refused; the preflight turns each into a block. */
export type AssemblyProblem =
  | { readonly code: 'report-incomplete'; readonly pointId: string; readonly title: string }
  | { readonly code: 'snapshot-invalid'; readonly paths: readonly string[] };

/** A placed proposal whose point went back to its author or out. */
export interface DroppedRef {
  readonly id: string;
  readonly title: string;
  readonly state: PointState;
}

/** What the preflight reads besides the snapshot (design §4, §11). */
export interface AssemblyFacts {
  readonly issue: {
    /** Null for a Monday with no row yet. */
    readonly id: string | null;
    readonly monday: CalDate;
    readonly meetingDate: CalDate;
    readonly status: IssueStatus;
    readonly deadlineAt: Date;
  };
  readonly origin: OutlineOrigin;
  /** Status of the issue the outline was derived from; null when stored or seeded. */
  readonly sourceStatus: IssueStatus | null;
  readonly waiting: {
    readonly submitted: readonly PointRef[];
    readonly returned: readonly PointRef[];
    /** Approved reports whose event does not end before the meeting date. */
    readonly later: readonly PointRef[];
  };
  /** Submitted akce and jednání that fall in the meetings or events window. */
  readonly akceWaiting: readonly { readonly id: string; readonly title: string }[];
  readonly dropped: readonly DroppedRef[];
  readonly annex1Entries: number;
  readonly newEntries: number;
  /** Media and partners both have nothing in them. */
  readonly ohlasyEmpty: boolean;
}

export type AssemblyResult = {
  readonly snapshot: IssueSnapshot | null;
  readonly problems: readonly AssemblyProblem[];
  readonly facts: AssemblyFacts;
};
