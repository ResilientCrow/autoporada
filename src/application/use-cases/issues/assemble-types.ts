import type { FutureItemRecord, PointRecord, PointRef, PointStanding } from '@/application/ports';
import type { OutlineOrigin } from '@/domain/outline';
import type { IssueStatus, PointState } from '@/domain/review';
import type { CalDate } from '@/domain/time';
import type { IssueSnapshot } from '@/snapshot';

import type { LateExpected } from './late-reports';

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

/** An approved akce whose report the porada does not have, and where that report stands (ADR 0049). */
export interface MissingReport {
  readonly akce: FutureItemRecord;
  /** The report point the akce names; null when none was started. */
  readonly report: PointStanding | null;
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
  /** The earliest porada of the calendar before this one that is not generated. */
  readonly earlierOpen: { readonly monday: CalDate; readonly meetingDate: CalDate } | null;
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
  /** Late reports (ADR 0035) the porada still waits for, within the read scope. */
  readonly lateExpected: readonly LateExpected[];
  /** Late drafts of other authors no akce answers for: only counted (SSU-5). */
  readonly lateDraftsHidden: number;
  readonly dropped: readonly DroppedRef[];
  /**
   * The akce the porada prints a placeholder for, by their date: `id` and `title` are the akce's,
   * `state` is where its report point stands (`none` when nobody started one).
   */
  readonly missingReports: readonly {
    readonly id: string;
    readonly title: string;
    readonly state: 'none' | PointState;
  }[];
  /**
   * Of those, the placeholders the headmaster has not checked (ADR 0061): the paragraph confirmed is
   * not the one the system writes now. A warning before generating, never a refusal.
   */
  readonly uncheckedPlaceholders: readonly { readonly id: string; readonly title: string }[];
  readonly annex1Entries: number;
  readonly newEntries: number;
  /** Media and partners both have nothing in them. */
  readonly ohlasyEmpty: boolean;
}

/** What a generation publishes with the snapshot: the eligible points, the entries printed first. */
interface AssemblyPublish {
  readonly points: readonly PointRecord[];
  /** The akce a generation closes as `missed`, with their unfinished report points to close. */
  readonly missing: readonly MissingReport[];
  readonly entryIds: readonly string[];
}

export type AssemblyResult = {
  readonly snapshot: IssueSnapshot | null;
  readonly problems: readonly AssemblyProblem[];
  readonly facts: AssemblyFacts;
  readonly publish: AssemblyPublish;
};
