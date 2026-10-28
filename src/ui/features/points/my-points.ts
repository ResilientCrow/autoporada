import type { PointState } from '@/domain/review';

/** The groups of „Moje body“, in the order the page shows them. */
export const MY_POINT_GROUPS = ['returned', 'draft', 'submitted', 'approved', 'closed'] as const;
export type MyPointGroup = (typeof MY_POINT_GROUPS)[number];

/** Where each state is listed: a published point stays with the approved ones, a rejected or cancelled one is closed. */
const GROUP_OF: Readonly<Record<PointState, MyPointGroup>> = {
  returned: 'returned',
  draft: 'draft',
  submitted: 'submitted',
  approved: 'approved',
  published: 'approved',
  rejected: 'closed',
  withdrawn: 'closed',
};

/** One line of the list. */
export interface MyPointRow {
  readonly id: string;
  readonly state: PointState;
  /** Empty while the author has not named the point. */
  readonly title: string;
  /** The first line of the note a returned point came back with. */
  readonly returnNote: string | null;
  /** The Monday an approved point goes to the porada from, ISO; null for any other point. */
  readonly placement: string | null;
}

export interface MyPointsGroup {
  readonly group: MyPointGroup;
  readonly rows: readonly MyPointRow[];
  /** Only the closed points are folded away. */
  readonly collapsed: boolean;
}

/** The rows by group, groups in page order, each keeping the order the rows came in; groups with no rows are left out. */
export function groupMyPoints(rows: readonly MyPointRow[]): readonly MyPointsGroup[] {
  return MY_POINT_GROUPS.map((group) => ({
    group,
    rows: rows.filter((row) => GROUP_OF[row.state] === group),
    collapsed: group === 'closed',
  })).filter((grouped) => grouped.rows.length > 0);
}

/** A count per state, summed into the groups. */
export function countByGroup(
  counts: Readonly<Record<PointState, number>>,
): Readonly<Record<MyPointGroup, number>> {
  const total: Record<MyPointGroup, number> = {
    returned: 0,
    draft: 0,
    submitted: 0,
    approved: 0,
    closed: 0,
  };
  for (const [state, n] of Object.entries(counts)) {
    const group = GROUP_OF[state as PointState];
    total[group] += n;
  }
  return total;
}
