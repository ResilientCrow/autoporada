import type { DeriveSource, Outline } from '@/domain/outline';
import type { RichDoc } from '@/domain/richtext';
import type { CalDate } from '@/domain/time';

/** The three texts an issue may carry of its own, each as stored (null = never written). */
export interface IssueTexts {
  readonly present: string | null;
  readonly guests: string | null;
  readonly annex2: RichDoc | null;
}

/**
 * The outline rows of the issues (`issue_items`, design §2): the items of POKYNY and
 * HOSPODAŘENÍ in order. Headmaster text, not personal data: every principal reads, the headmaster
 * writes (`issue.edit`, re-checked here, ADR 0011). The worker role is granted nothing on the table.
 */
export interface IssueItemRepo {
  /** The stored rows of the issue; the array order is the position. Empty when it has none. */
  forIssue(issueId: string): Promise<Outline>;
  /**
   * Makes `outline` the issue's rows: deletes the old ones and inserts the new, each with a new id
   * and its lineage kept. Rows that are placements (`sourcePointId`) are written as such; the
   * caller leaves virtual proposal rows out. Writes no version: the caller has taken the issue's
   * version with `issues.touch` and has read the deadline rule first (lock order, row 12b). The
   * table's CHECKs and unique keys refuse a bad row as `db.constraint.<name>` (ADR 0022).
   */
  replace(issueId: string, outline: Outline): Promise<void>;
  /**
   * The latest issue before `monday` that has rows, whatever its status, with its rows; null when
   * none. The source of a derived outline (`derive`).
   */
  latestSourceBefore(monday: CalDate): Promise<DeriveSource | null>;
  /**
   * Hands the further annexes of the porada of Monday `from` (the Arch UI's `arch_annexes`) over
   * to the porada of Monday `to`: they follow the annexes it has, and `from` has none after. With
   * `to` null they are only deleted. Gives how many annexes there were. A privileged write
   * (`issue.edit`, ADR 0011); the caller holds the deadline lock in update mode.
   */
  handOverAnnexes(from: CalDate, to: CalDate | null): Promise<number>;
  /** The issue's own three texts, each null when never written; all null for an unknown id. */
  textsOf(issueId: string): Promise<IssueTexts>;
  /**
   * Per text, the value of the latest issue before `monday` whose value is not null (an empty string or an empty doc is a value: a cleared text carries as cleared).
   */
  latestTextsBefore(monday: CalDate): Promise<IssueTexts>;
}
