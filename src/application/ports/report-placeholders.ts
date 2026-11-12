/**
 * What the headmaster stored for an akce's missing report, and the version a write must name
 * (ADR 0049, 0061).
 */
export interface StoredPlaceholder {
  readonly futureItemId: string;
  /** The paragraph they wrote in place of the system's; null prints the system's. Plain text people wrote: never logged, never audited. */
  readonly paragraph: string | null;
  /** The system paragraph they confirmed; the placeholder is checked while it is the current one. */
  readonly confirmedOriginal: string | null;
  readonly version: number;
}

/**
 * The `report_placeholders` table, one row per akce (ADR 0049, 0061): the headmaster's replacement for
 * the paragraph a missing report prints and the paragraph they confirmed. No row means the paragraph the system writes. Reads need
 * `issue.preview` (or the system), writes `issue.edit`; the worker has no grant on the table.
 */
export interface ReportPlaceholderRepo {
  /** The rows that exist for these akce, in no particular order; an akce with no row is left out. */
  many(futureItemIds: readonly string[]): Promise<readonly StoredPlaceholder[]>;
  /**
   * Stores `paragraph` for the akce if the row is still at `expectedVersion`, and gives the new
   * version; null when it is not (a stale save). Version 0 names "no row yet": the insert then loses
   * quietly to a row another save made first, so two first saves give one winner and one null. The
   * table's CHECK (1 to `POINT_LIMITS.placeholder` characters) holds. A save clears the confirmation. ScopeViolation for a user who may
   * not `issue.edit`.
   */
  save(futureItemId: string, paragraph: string, expectedVersion: number): Promise<number | null>;
  /**
   * Records that the headmaster confirmed `original`, the system paragraph, keeping their own
   * `paragraph`, if the row is still at `expectedVersion` (0: no row yet, the insert then loses
   * quietly to a row made first): gives the new version, null when stale. ScopeViolation for a user
   * who may not `issue.edit`.
   */
  confirm(futureItemId: string, original: string, expectedVersion: number): Promise<number | null>;
  /**
   * Removes the row, back to the system's paragraph, if it is still at `expectedVersion`: true when
   * it was removed, false when the row moved on or is gone. ScopeViolation for a user who may not
   * `issue.edit`.
   */
  remove(futureItemId: string, expectedVersion: number): Promise<boolean>;
}
