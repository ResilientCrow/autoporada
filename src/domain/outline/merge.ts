import type { PointState } from '@/domain/review';

import { SECTIONS, type Outline, type OutlineRow, type OutlineSection } from './model';

/** An approved proposal that is not published yet (ADR 0029). */
export interface EligibleProposal {
  readonly pointId: string;
  readonly section: OutlineSection;
  readonly submittedAt: Date;
}

export interface DroppedProposal {
  readonly pointId: string;
  readonly section: OutlineSection;
  readonly state: PointState;
}

export interface Merged {
  readonly outline: Outline;
  /** Placed proposals now returned, rejected or withdrawn: the preflight warning `proposal-dropped`. */
  readonly dropped: readonly DroppedProposal[];
}

/**
 * Placed rows whose point is eligible keep their place; others disappear. Silently when the point
 * is published or gone (V5), reported when it went back to the author or out. Eligible proposals
 * nobody placed come last in their section, by `submittedAt` and then id.
 *
 * `states` holds the state of every placed point that is not eligible.
 */
export function mergeProposals(
  outline: Outline,
  eligible: readonly EligibleProposal[],
  states: ReadonlyMap<string, PointState>,
): Merged {
  const open = new Map(eligible.map((p) => [p.pointId, p]));
  const placed = new Set<string>();
  const dropped: DroppedProposal[] = [];
  const merged = {} as { -readonly [S in OutlineSection]: OutlineRow[] };
  for (const section of SECTIONS) {
    merged[section] = outline[section].filter((row) => {
      if (row.sourcePointId === null) return true;
      if (open.has(row.sourcePointId)) {
        placed.add(row.sourcePointId);
        return true;
      }
      const state = states.get(row.sourcePointId);
      if (state === 'returned' || state === 'rejected' || state === 'withdrawn') {
        dropped.push({ pointId: row.sourcePointId, section, state });
      }
      return false;
    });
  }
  const unplaced = eligible
    .filter((p) => !placed.has(p.pointId))
    .sort(
      (a, b) =>
        a.submittedAt.getTime() - b.submittedAt.getTime() || (a.pointId < b.pointId ? -1 : 1),
    );
  for (const p of unplaced) {
    merged[p.section].push({
      lineageId: p.pointId,
      section: p.section,
      slot: null,
      persistence: 'once',
      title: null,
      body: null,
      quotes: [],
      sourcePointId: p.pointId,
      isNew: true,
    });
  }
  return { outline: merged, dropped };
}
