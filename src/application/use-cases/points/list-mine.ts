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

/** The first line with something on it: the list shows no more of a note. */
const firstLine = (note: string | null) =>
  note
    ?.split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line !== '') ?? null;

const summaryWire = (row: PointSummary) => ({
  ...row,
  returnNote: firstLine(row.returnNote),
  eventDate: dateText(row.eventDate),
  earliestMonday: dateText(row.earliestMonday),
  submittedAt: row.submittedAt?.toISOString() ?? null,
  updatedAt: row.updatedAt.toISOString(),
});

/**
 * „Moje body“ (design section 9): the reader's own points, last changed
 * first, a page at a time. Anyone who may start a point has some, a student
 * submitter too; grouping by state is the page's. One row more than a page is
 * read: only when it exists is there an older page, and its cursor is the
 * page's last row, where „Starší body“ continues.
 */
export const listMyPoints = defineUseCase({
  name: 'points.listMine',
  mode: 'read',
  input: listMyPointsInput,
  output: listMyPointsOutput,
  access: { kind: 'gate', check: () => ({ action: 'point.create' }) },
  async execute({ tx }, { before }) {
    const read = await tx.points.listMine(MY_POINTS_PAGE + 1, before);
    const rows = read.slice(0, MY_POINTS_PAGE);
    const last = read.length > MY_POINTS_PAGE ? rows.at(-1) : undefined;
    return ok({ points: rows.map(summaryWire), next: last ? pointCursorText(last) : null });
  },
});
