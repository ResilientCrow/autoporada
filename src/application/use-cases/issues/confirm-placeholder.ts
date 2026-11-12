import { defineUseCase, fail, ok } from '@/application/core';
import { confirmPlaceholderInput, confirmPlaceholderOutput } from '@/contracts';
import { compareDates, toIsoDate } from '@/domain/time';

import { missingReportOf, systemParagraph } from './assemble-missing';
import { mondayOfText, readWindow } from './calendar';
import { ensureIssue } from './ensure';

/**
 * „Zkontrolováno“ on Chybějící zprávy (ADR 0061): the headmaster confirms the paragraph a missing
 * report prints. The server stores the paragraph the system writes now as the one confirmed, so the
 * placeholder stays checked only while the akce and the template keep that text. `akceVersion` is
 * the akce the headmaster read: if it moved, nothing is confirmed (`conflict`). Only an open
 * porada, and only an akce owed to it with no report (else `not-found`). The text is never audited.
 */
export const confirmPlaceholder = defineUseCase({
  name: 'issues.confirmPlaceholder',
  mode: 'write',
  input: confirmPlaceholderInput,
  output: confirmPlaceholderOutput,
  access: { kind: 'gate', check: () => ({ action: 'issue.edit' }) },
  async execute({ tx, now }, input) {
    const monday = mondayOfText(input.monday);
    if (!monday) return fail({ code: 'invalid-input', fields: { monday: 'invalid' } });

    // The lock order of `issues.setPlaceholder`: the rule, then the issue row, which
    // `issues.generate` takes before it reads the placeholders.
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
    const basis = missing && systemParagraph(missing.akce);
    if (missing === null || basis === null) return fail({ code: 'not-found' });
    if (missing.akce.version !== input.akceVersion) return fail({ code: 'conflict' });

    const version = await tx.reportPlaceholders.confirm(input.itemId, basis, input.expectedVersion);
    if (version === null) return fail({ code: 'conflict' });
    await tx.audit.record({
      action: 'issue.placeholder_confirmed',
      target: { type: 'future_item', id: input.itemId },
      meta: { monday: toIsoDate(monday) },
      related: inserted ? [{ type: 'issue', id: issue.id }] : [],
    });
    return ok({ version });
  },
});
