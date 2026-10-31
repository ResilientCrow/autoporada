import { fail, ok, type Outcome } from '@/application/core';
import type { IssueTexts, Json, Tx } from '@/application/ports';
import { compareDates, toIsoDate } from '@/domain/time';

import { mondayOfText, readWindow } from './calendar';
import { ensureIssue } from './ensure';

/** What a client that saw no row for the Monday read: an untouched issue. */
const UNTOUCHED_VERSION = 1;

export interface TextsEdit {
  readonly monday: string;
  readonly expectedVersion: number | undefined;
  /** The texts to write; a text left out stays as it is (or stays carried). */
  readonly texts: Partial<IssueTexts>;
  readonly event: 'issue.details_saved' | 'issue.annex2_saved';
  /** Names and counts only; never the text (audit-meta test). */
  readonly meta: Readonly<Record<string, Json>>;
}

/**
 * The write flow of the issue's own texts (ADR 0030): the deadline rule is read first, then the
 * issue is made if it has no row, and the texts are written with its version in one update. Only
 * an open porada can be edited. The meeting date is not touched; a move does that.
 */
export async function editTexts(
  { tx, now }: { readonly tx: Tx; readonly now: Date },
  edit: TextsEdit,
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
  const written = await tx.issues.setTexts(
    issue.id,
    edit.expectedVersion ?? UNTOUCHED_VERSION,
    edit.texts,
  );
  await tx.audit.record({
    action: edit.event,
    target: { type: 'issue', id: issue.id },
    meta: { monday: toIsoDate(monday), ...edit.meta },
  });
  return ok({ version: written.version });
}
