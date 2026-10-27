import type { Omitted } from '@/document';
import { points } from '@/ui/copy';

/**
 * What the preview says it left out: one line for each count that is not zero, the people,
 * then the rows (people rows and text rows together), then the statements.
 */
export function previewNotices(omitted: Omitted): readonly string[] {
  const rows = omitted.peopleBullets + omitted.textBullets;
  return [
    omitted.people > 0 ? points.preview.omittedPeople(omitted.people) : null,
    rows > 0 ? points.preview.omittedRows(rows) : null,
    omitted.statements > 0 ? points.preview.omittedStatements(omitted.statements) : null,
  ].filter((line) => line !== null);
}
