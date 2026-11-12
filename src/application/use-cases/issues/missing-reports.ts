import { defineUseCase, fail, ok, readReportsSince } from '@/application/core';
import { missingReportsInput, missingReportsOutput } from '@/contracts';
import { placeholderChecked, placeholderStatus } from '@/domain/review';
import { richDocToPlainText } from '@/domain/richtext';
import { compareDates, toIsoDate } from '@/domain/time';

import {
  missingReports,
  owedAkce,
  placeholderCloses,
  placeholderReports,
  systemParagraph,
} from './assemble-missing';
import { mondayOfText, readWindow } from './calendar';

/**
 * „Chybějící zprávy“ for its page (ADR 0049): the akce the porada owes a report for and does not
 * have one, by their date, each with the paragraph the document would print now, whether that is
 * the headmaster's own, the version a save names, and where the placeholder stands (ADR 0061). A generated porada lists nothing:
 * it has nothing to edit. Read-only; the rule is read first, before any issue row.
 */
export const issueMissingReports = defineUseCase({
  name: 'issues.missingReports',
  mode: 'read',
  input: missingReportsInput,
  output: missingReportsOutput,
  access: { kind: 'gate', check: () => ({ action: 'issue.edit' }) },
  async execute({ tx, now }, input) {
    const monday = mondayOfText(input.monday);
    if (!monday) return fail({ code: 'invalid-input', fields: { monday: 'invalid' } });
    const { slots, plannedThrough } = await readWindow(tx, now);
    const slot = slots.find((s) => compareDates(s.monday, monday) === 0);
    if (!slot) return fail({ code: 'not-found' });

    const head = { monday: toIsoDate(monday), meetingDate: toIsoDate(slot.meetingDate) };
    if (slot.status !== 'open') return ok({ ...head, open: false, reports: [] });

    const since = await readReportsSince(tx, monday, plannedThrough);
    const points = await tx.points.eligibleFor(monday, slot.meetingDate, { since });
    const missing = await missingReports(tx, await owedAkce(tx, since, slot.meetingDate), points);
    const printed = new Map((await placeholderReports(tx, missing)).map((r) => [r.id, r]));
    const stored = new Map(
      (await tx.reportPlaceholders.many(missing.map((m) => m.akce.id))).map((s) => [
        s.futureItemId,
        s,
      ]),
    );
    return ok({
      ...head,
      open: true,
      reports: missing.flatMap(({ akce, report }) => {
        const printing = printed.get(akce.id);
        const closesAt = placeholderCloses(akce, slot);
        if (printing === undefined || closesAt === null) return [];
        const row = stored.get(akce.id);
        const original = systemParagraph(akce) ?? '';
        const checked = placeholderChecked(row?.confirmedOriginal ?? null, original);
        return [
          {
            id: akce.id,
            title: printing.title,
            startDate: printing.date,
            endDate: printing.endDate ?? null,
            state: report?.state ?? ('none' as const),
            paragraph: richDocToPlainText(printing.body),
            original,
            own: (row?.paragraph ?? null) !== null,
            status: placeholderStatus({ checked, report: report?.state ?? 'none', closesAt }, now),
            checked,
            dueAt: closesAt.toISOString(),
            akceVersion: akce.version,
            version: row?.version ?? 0,
          },
        ];
      }),
    });
  },
});
