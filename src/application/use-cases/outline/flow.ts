import { eligiblePoints, fail, ok, type Outcome } from '@/application/core';
import type { Json, Tx } from '@/application/ports';
import { toIsoDate } from '@/domain/time';
import { restoreHeld, type Outline, type OutlineResult } from '@/domain/outline';
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
  /**
   * True when the outline already holds what the op would make (a retried add). The write then
   * changes nothing: no version bump, no audit row; the version the client sent must still be current.
   */
  readonly alreadyDone?: (outline: Outline) => boolean;
  readonly event: 'outline.added' | 'outline.saved' | 'outline.moved' | 'outline.removed';
  /** Ids and counts of the result; never text (audit-meta test). */
  readonly meta: (
    before: Outline,
    after: Outline,
  ) => Readonly<Record<string, Json>> & { readonly monday: string };
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
  const { slots, rule, plannedThrough } = await readWindow(tx, now);
  const slot = slots.find((s) => compareDates(s.monday, monday) === 0);
  if (!slot) return fail({ code: 'invalid-input', fields: { monday: 'invalid' } });
  if (slot.status !== 'open') return fail({ code: 'rule', rule: 'issue-not-open' });

  const ensured = await ensureIssue(tx, monday, { rule, plannedThrough });
  if (!ensured) return fail({ code: 'not-found' });
  const { issue } = ensured;
  if (issue.status !== 'open') return fail({ code: 'rule', rule: 'issue-not-open' });
  const expected = edit.expectedVersion ?? UNTOUCHED_VERSION;
  const proposals = await eligiblePoints(tx, monday, issue.meetingDate, plannedThrough);
  if (edit.alreadyDone) {
    // A look before the version is taken; nothing is written on this path.
    const peek = await loadEditable(tx, { id: issue.id, monday }, proposals);
    if (edit.alreadyDone(peek.outline)) {
      if (issue.version !== expected) return fail({ code: 'conflict' });
      return ok({ version: issue.version });
    }
  }
  const touched = await tx.issues.touch(issue.id, expected);

  const loaded = await loadEditable(tx, { id: issue.id, monday }, proposals);
  const result = edit.apply(loaded.outline);
  if (!result.ok) return fail({ code: 'rule', rule: result.refusal });
  // Proposals back with their authors keep their place (ADR 0036).
  const written = restoreHeld(result.outline, loaded.held);
  if (!written.ok) return fail({ code: 'rule', rule: written.refusal });

  await writeOutline(tx, issue.id, written.outline);
  const target = { type: 'issue', id: issue.id } as const;
  const { origin } = loaded;
  if (origin.kind !== 'stored') {
    const day = toIsoDate(monday);
    const rows = result.outline.pokyny.length + result.outline.hospodareni.length;
    await tx.audit.record({
      action: 'outline.materialized',
      target,
      meta:
        origin.kind === 'derived'
          ? {
              monday: day,
              origin: origin.kind,
              from: toIsoDate(origin.from),
              how: origin.how,
              rows,
            }
          : { monday: day, origin: origin.kind, rows },
    });
  }
  await tx.audit.record({
    action: edit.event,
    target,
    meta: edit.meta(loaded.outline, result.outline),
  });
  return ok({ version: touched.version });
}
