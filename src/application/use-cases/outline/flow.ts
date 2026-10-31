import { fail, ok, type Outcome } from '@/application/core';
import type { Json, Tx } from '@/application/ports';
import { toIsoDate } from '@/domain/time';
import type { Outline, OutlineResult } from '@/domain/outline';
import { compareDates } from '@/domain/time';

import { mondayOfText, readWindow } from '../issues/calendar';
import { ensureIssue } from '../issues/ensure';
import { loadEditable, writeOutline } from '../issues/outline-store';

/** What a client that saw no row for the Monday read: an untouched issue. */
const UNTOUCHED_VERSION = 1;

export interface OutlineEdit {
  readonly monday: string;
  readonly expectedVersion: number | undefined;
  readonly apply: (outline: Outline) => OutlineResult;
  readonly event: 'outline.added' | 'outline.saved' | 'outline.moved' | 'outline.removed';
  /** Ids and counts of the result; never text (audit-meta test). */
  readonly meta: (before: Outline, after: Outline) => Readonly<Record<string, Json>>;
}

/**
 * The write flow every outline use case shares (ADR 0030): the deadline rule is read first, then the
 * issue is made if it has no row, its version taken, the outline loaded (stored, or derived from the
 * latest earlier issue or the seed, and written now), one op applied and all rows replaced. Only an
 * open porada can be edited. A refusal of the op is a rule code.
 */
export async function editOutline(
  { tx, now }: { readonly tx: Tx; readonly now: Date },
  edit: OutlineEdit,
): Promise<Outcome<{ readonly version: number }>> {
  const monday = mondayOfText(edit.monday);
  if (!monday) return fail({ code: 'invalid-input', fields: { monday: 'invalid' } });

  // Lock order: the rule (settings share lock) before any issue row.
  const { slots, rule } = await readWindow(tx, now);
  const slot = slots.find((s) => compareDates(s.monday, monday) === 0);
  if (!slot) return fail({ code: 'invalid-input', fields: { monday: 'invalid' } });
  if (slot.status !== 'open') return fail({ code: 'rule', rule: 'issue-not-open' });

  const { issue } = await ensureIssue(tx, monday, rule);
  if (issue.status !== 'open') return fail({ code: 'rule', rule: 'issue-not-open' });
  const touched = await tx.issues.touch(issue.id, edit.expectedVersion ?? UNTOUCHED_VERSION);

  const proposals = await tx.points.eligibleFor(monday, issue.meetingDate);
  const loaded = await loadEditable(tx, { id: issue.id, monday }, proposals);
  const result = edit.apply(loaded.outline);
  if (!result.ok) return fail({ code: 'rule', rule: result.refusal });

  await writeOutline(tx, issue.id, result.outline);
  const target = { type: 'issue', id: issue.id } as const;
  const { origin } = loaded;
  if (origin.kind !== 'stored') {
    await tx.audit.record({
      action: 'outline.materialized',
      target,
      meta: {
        monday: toIsoDate(monday),
        origin: origin.kind,
        ...(origin.kind === 'derived' && { from: toIsoDate(origin.from), how: origin.how }),
        rows: result.outline.pokyny.length + result.outline.hospodareni.length,
      },
    });
  }
  await tx.audit.record({
    action: edit.event,
    target,
    meta: { monday: toIsoDate(monday), ...edit.meta(loaded.outline, result.outline) },
  });
  return ok({ version: touched.version });
}
