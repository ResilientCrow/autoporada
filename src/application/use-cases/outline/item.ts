import { defineUseCase, eligiblePoints, fail, ok } from '@/application/core';
import { bodyWire, outlineItemInput, outlineItemOutput } from '@/contracts';
import { SECTIONS, type OutlineRow } from '@/domain/outline';
import { emptyRichDoc, singleLine } from '@/domain/richtext';
import { compareDates, toIsoDate } from '@/domain/time';

import { mondayOfText, readWindow } from '../issues/calendar';
import { loadEditable } from '../issues/outline-store';

/**
 * One item of a porada's outline for its editor: title, text, quotes and persistence as stored (the
 * outline derived from an earlier porada or the seed, until the first write stores it). Nothing is
 * written. A Monday outside the calendar or an unknown item is not found.
 */
export const readOutlineItem = defineUseCase({
  name: 'outline.item',
  mode: 'read',
  input: outlineItemInput,
  output: outlineItemOutput,
  access: { kind: 'gate', check: () => ({ action: 'issue.edit' }) },
  async execute({ tx, now }, input) {
    const monday = mondayOfText(input.monday);
    if (!monday) return fail({ code: 'invalid-input', fields: { monday: 'invalid' } });
    const { slots, plannedThrough } = await readWindow(tx, now);
    const slot = slots.find((s) => compareDates(s.monday, monday) === 0);
    if (!slot) return fail({ code: 'not-found' });

    const [issue] = await tx.issues.between(monday, monday);
    const proposals = await eligiblePoints(tx, monday, slot.meetingDate, plannedThrough);
    const { outline } = await loadEditable(tx, { id: issue?.id ?? null, monday }, proposals);
    const found = SECTIONS.flatMap((section) =>
      outline[section]
        .filter((r) => r.lineageId === input.lineageId)
        .map((row) => ({ section, row })),
    )[0];
    if (!found) return fail({ code: 'not-found' });
    const { section, row } = found;
    return ok({
      monday: toIsoDate(monday),
      version: issue?.version ?? null,
      lineageId: row.lineageId,
      section,
      slot: row.slot,
      persistence: row.persistence,
      title: titleOf(row, proposals),
      body: bodyWire(row.body ?? emptyRichDoc()),
      quotes: row.quotes.map((q) => ({ ...q })),
      proposal: row.sourcePointId === null ? null : { pointId: row.sourcePointId },
    });
  },
});

function titleOf(
  row: OutlineRow,
  proposals: readonly { readonly id: string; readonly content: { readonly title: string } }[],
): string {
  if (row.sourcePointId === null) return row.title ?? '';
  const point = proposals.find((p) => p.id === row.sourcePointId);
  return point === undefined ? '' : singleLine(point.content.title);
}
