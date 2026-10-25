import { defineUseCase, ok } from '@/application/core';
import type { PointSummary } from '@/application/ports';
import {
  listMyPointsInput,
  listMyPointsOutput,
  MY_POINTS_PAGE,
  pointCursorText,
} from '@/contracts';
import { toIsoDate, type CalDate } from '@/domain/time';

const dateText = (date: CalDate | null) => date && toIsoDate(date);

const summaryWire = (row: PointSummary) => ({
  ...row,
  eventDate: dateText(row.eventDate),
  earliestMonday: dateText(row.earliestMonday),
  submittedAt: row.submittedAt?.toISOString() ?? null,
  updatedAt: row.updatedAt.toISOString(),
});

/**
 * „Moje body“ (design section 9): the reader's own points, last changed
 * first, a page at a time. Anyone who may start a point has some, a student
 * submitter too; grouping by state is the page's. A full page names its last
 * row as `next`, where „Starší body“ continues.
 */
export const listMyPoints = defineUseCase({
  name: 'points.listMine',
  mode: 'read',
  input: listMyPointsInput,
  output: listMyPointsOutput,
  access: { kind: 'gate', check: () => ({ action: 'point.create' }) },
  async execute({ tx }, { before }) {
    const rows = await tx.points.listMine(MY_POINTS_PAGE, before);
    const last = rows.length === MY_POINTS_PAGE ? rows.at(-1) : undefined;
    return ok({ points: rows.map(summaryWire), next: last ? pointCursorText(last) : null });
  },
});
