/** Bounds of the outline; the Zod inputs and the `issue_items` CHECKs repeat them (ADR 0030). */
export const OUTLINE_LIMITS = {
  /** Rows in one section. */
  rowsPerSection: 60,
  title: 300,
  /** Quotes of the partners slot. */
  quotes: 20,
} as const;
