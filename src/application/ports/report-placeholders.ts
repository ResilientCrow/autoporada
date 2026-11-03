/** The paragraph the headmaster wrote in place of the system's, and the version a save must name. */
export interface StoredPlaceholder {
  readonly futureItemId: string;
  /** Plain text people wrote: never logged, never audited. */
  readonly paragraph: string;
  readonly version: number;
}

/**
 * The `report_placeholders` table, one row per akce (ADR 0049): the headmaster's replacement for the
 * paragraph a missing report prints. No row means the paragraph the system writes. Reads need
 * `issue.preview` (or the system), writes `issue.edit`; the worker has no grant on the table.
 */
export interface ReportPlaceholderRepo {
  /** The rows that exist for these akce, in no particular order; an akce with no row is left out. */
  many(futureItemIds: readonly string[]): Promise<readonly StoredPlaceholder[]>;
  /**
   * Stores `paragraph` for the akce if the row is still at `expectedVersion`, and gives the new
   * version; null when it is not (a stale save). Version 0 names "no row yet": the insert then loses
   * quietly to a row another save made first, so two first saves give one winner and one null. The
   * table's CHECK (1 to `POINT_LIMITS.opening` characters) holds. ScopeViolation for a user who may
   * not `issue.edit`.
   */
  save(futureItemId: string, paragraph: string, expectedVersion: number): Promise<number | null>;
  /**
   * Removes the row, back to the system's paragraph, if it is still at `expectedVersion`: true when
   * it was removed, false when the row moved on or is gone. ScopeViolation for a user who may not
   * `issue.edit`.
   */
  remove(futureItemId: string, expectedVersion: number): Promise<boolean>;
}
