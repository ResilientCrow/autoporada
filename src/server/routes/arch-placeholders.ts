/**
 * Branch arch-ui only: the missing-report paragraphs the headmaster wrote, and whether they checked
 * each one (ADR 0061). Staff read the texts; only the headmaster gets the checks.
 */
import type { FutureItemRecord, UserPrincipal } from '@/application/ports';
import { issueMissingReports, systemParagraph } from '@/application/use-cases';
import { placeholderChecked } from '@/domain/review';

import type { WebContainer } from '../container';
import { runRegistered } from '../pipeline';

interface ServerReport {
  id: string;
  status: NonNullable<PlaceholderCheck['status']>;
  checked: boolean;
}

export interface PlaceholderCheck {
  checked: boolean;
  was: string | null;
  /** The server's `placeholderStatus`; set by `withServerStatus` for the headmaster. */
  status?: 'checked' | 'handed-in' | 'open' | 'to-check';
}

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
  const placeholderChecks: Record<string, PlaceholderCheck> = {};
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
    // Staff can never write a placeholder: only the headmaster gets the versions to write with.
    if (head) vers[`ph:${r.futureItemId}`] = r.version;
  }
  return { placeholders, placeholderChecks };
}

/**
 * The headmaster's checks with the server's own reading of every missing report in the open poradas
 * (`issues.missingReports`, read for each by `readReports`): the status Arch shows and counts, so it
 * never differs from the one the generate screen and the classic page give (ADR 0061). An akce with
 * no stored row gets an entry too.
 */
export async function withServerStatus(
  checks: Readonly<Record<string, PlaceholderCheck>>,
  issues: readonly Record<string, unknown>[],
  readReports: (monday: string) => Promise<readonly ServerReport[]>,
): Promise<Record<string, PlaceholderCheck>> {
  const out = { ...checks };
  for (const issue of issues) {
    if (issue['status'] !== 'open') continue;
    for (const r of await readReports(String(issue['monday']))) {
      out[r.id] = { was: out[r.id]?.was ?? null, checked: r.checked, status: r.status };
    }
  }
  return out;
}

/** `withServerStatus` reading `issues.missingReports` as the headmaster `principal`. */
export function withServerStatusOf(
  c: WebContainer,
  principal: UserPrincipal,
  checks: Readonly<Record<string, PlaceholderCheck>>,
  issues: readonly Record<string, unknown>[],
): Promise<Record<string, PlaceholderCheck>> {
  return withServerStatus(checks, issues, async (monday) => {
    const r = await runRegistered(c, issueMissingReports, {
      principal,
      requestId: 'arch.state',
      input: { monday },
    });
    return r.ok ? r.value.reports : [];
  });
}
