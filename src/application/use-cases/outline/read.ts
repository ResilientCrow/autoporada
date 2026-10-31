import { defineUseCase, fail, ok } from '@/application/core';
import { outlineReadInput, outlineReadOutput } from '@/contracts';
import { compareDates, toIsoDate } from '@/domain/time';
import { SECTIONS, type OutlineRow } from '@/domain/outline';
import { singleLine } from '@/domain/richtext';

import { mondayOfText, readWindow } from '../issues/calendar';
import { loadEditable } from '../issues/outline-store';

/**
 * The outline of a porada as the headmaster's page lists it: both sections in order with the
 * newly approved proposals at the end, and where the rows come from (stored, derived from an
 * earlier porada, or the seed). Nothing is written. A Monday outside the calendar is not found.
 */
export const readOutline = defineUseCase({
  name: 'outline.read',
  mode: 'read',
  input: outlineReadInput,
  output: outlineReadOutput,
  access: { kind: 'gate', check: () => ({ action: 'issue.edit' }) },
  async execute({ tx, now }, input) {
    const monday = mondayOfText(input.monday);
    if (!monday) return fail({ code: 'invalid-input', fields: { monday: 'invalid' } });
    const { slots } = await readWindow(tx, now);
    const slot = slots.find((s) => compareDates(s.monday, monday) === 0);
    if (!slot) return fail({ code: 'not-found' });

    const [issue] = await tx.issues.between(monday, monday);
    const proposals = await tx.points.eligibleFor(monday, slot.meetingDate);
    const titles = new Map(proposals.map((p) => [p.id, singleLine(p.content.title)]));
    const { outline, origin } = await loadEditable(
      tx,
      { id: issue?.id ?? null, monday },
      proposals,
    );
    const row = (r: OutlineRow) => ({
      lineageId: r.lineageId,
      slot: r.slot,
      persistence: r.persistence,
      title: r.sourcePointId === null ? (r.title ?? '') : (titles.get(r.sourcePointId) ?? ''),
      quotes: r.quotes.length,
      proposal:
        r.sourcePointId === null ? null : { pointId: r.sourcePointId, isNew: r.isNew === true },
    });
    const [pokyny, hospodareni] = SECTIONS.map((s) => outline[s].map(row));
    return ok({
      monday: toIsoDate(monday),
      version: issue?.version ?? null,
      origin: {
        kind: origin.kind,
        from: origin.kind === 'derived' ? toIsoDate(origin.from) : null,
      },
      pokyny: pokyny ?? [],
      hospodareni: hospodareni ?? [],
    });
  },
});
