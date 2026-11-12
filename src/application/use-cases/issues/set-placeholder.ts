import { defineUseCase, fail, ok } from '@/application/core';
import { setPlaceholderInput, setPlaceholderOutput } from '@/contracts';
import { compareDates, toIsoDate } from '@/domain/time';

import { missingReportOf } from './assemble-missing';
import { mondayOfText, readWindow } from './calendar';
import { ensureIssue } from './ensure';

/**
 * „Chybějící zprávy“: the headmaster's own paragraph for an akce the porada owes a report for
 * (ADR 0049). A text stores it under the akce, at the version the page read (0: no row yet); null
 * is „Obnovit původní text“ and removes the row, back to the paragraph the system writes. A
 * save clears the confirmation (ADR 0061). Only an open porada can be edited, and only for an
 * akce owed to it that has no report. The text is never audited.
 */
export const setPlaceholder = defineUseCase({
  name: 'issues.setPlaceholder',
  mode: 'write',
  input: setPlaceholderInput,
  output: setPlaceholderOutput,
  access: { kind: 'gate', check: () => ({ action: 'issue.edit' }) },
  async execute({ tx, now }, input) {
    const monday = mondayOfText(input.monday);
    if (!monday) return fail({ code: 'invalid-input', fields: { monday: 'invalid' } });

    // Lock order: the rule (settings share lock) before any issue row, then the issue row, which
    // `issues.generate` takes before it reads the placeholders: a save either commits before the
    // generation reads it, or waits for it and finds the porada closed.
    const { slots, rule, plannedThrough } = await readWindow(tx, now);
    const slot = slots.find((s) => compareDates(s.monday, monday) === 0);
    if (!slot) return fail({ code: 'invalid-input', fields: { monday: 'invalid' } });
    if (slot.status !== 'open') return fail({ code: 'rule', rule: 'issue-not-open' });
    const made = await ensureIssue(tx, monday, { rule, plannedThrough });
    if (!made) return fail({ code: 'not-found' });
    const { issue: ensured, inserted } = made;
    const issue = await tx.issues.lock(ensured.id);
    if (issue.status !== 'open') return fail({ code: 'rule', rule: 'issue-not-open' });

    const missing = await missingReportOf(
      tx,
      monday,
      issue.meetingDate,
      plannedThrough,
      input.itemId,
    );
    if (missing === null) {
      return fail({ code: 'invalid-input', fields: { itemId: 'invalid' } });
    }

    const meta = { monday: toIsoDate(monday) };
    const target = { type: 'future_item', id: input.itemId } as const;
    const related = inserted ? [{ type: 'issue' as const, id: issue.id }] : [];
    if (input.paragraph === null) {
      if (!(await tx.reportPlaceholders.remove(input.itemId, input.expectedVersion))) {
        return fail({ code: 'conflict' });
      }
      await tx.audit.record({ action: 'issue.placeholder_reset', target, meta, related });
      return ok({ version: 0 });
    }
    const version = await tx.reportPlaceholders.save(
      input.itemId,
      input.paragraph,
      input.expectedVersion,
    );
    if (version === null) return fail({ code: 'conflict' });
    await tx.audit.record({ action: 'issue.placeholder_saved', target, meta, related });
    return ok({ version });
  },
});
