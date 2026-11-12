/**
 * Branch arch-ui only: the missing-report paragraphs the headmaster wrote, and whether they checked
 * each one (ADR 0061). Staff read the texts; only the headmaster gets the checks.
 */
import { systemParagraph } from '@/application/use-cases';
import type { FutureItemRecord } from '@/application/ports';
import { placeholderChecked } from '@/domain/review';

import type { WebContainer } from '../container';

/**
 * `placeholders` are the headmaster's own paragraphs by akce id; `placeholderChecks` say, by akce id,
 * whether the paragraph confirmed is the one the system writes now (`checked`) and which one it was
 * (`was`, for the diff when the akce changed since).
 */
export async function archPlaceholders(
  db: WebContainer['arch'],
  { staff, head }: { staff: boolean; head: boolean },
  futureRows: readonly FutureItemRecord[],
  /** The versions writes must send back; filled with `ph:<akce id>`. */
  vers: Record<string, number>,
) {
  const rows = staff ? await db.placeholders(futureRows.map((f) => f.id)) : [];
  const placeholders: Record<string, string> = {};
  const placeholderChecks: Record<string, { checked: boolean; was: string | null }> = {};
  const futureById = new Map(futureRows.map((f) => [f.id, f]));
  for (const r of rows) {
    if (r.paragraph !== null) placeholders[r.futureItemId] = r.paragraph;
    const akce = futureById.get(r.futureItemId);
    if (head) {
      placeholderChecks[r.futureItemId] = {
        checked: placeholderChecked(r.confirmedOriginal, akce ? systemParagraph(akce) : null),
        was: r.confirmedOriginal,
      };
    }
    vers[`ph:${r.futureItemId}`] = r.version;
  }
  return { placeholders, placeholderChecks };
}
