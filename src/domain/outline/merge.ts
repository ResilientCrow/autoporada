import type { PointState } from '@/domain/review';

import { OUTLINE_LIMITS } from './limits';
import { SECTIONS, type Outline, type OutlineRow, type OutlineSection } from './model';
import type { OutlineResult } from './ops';

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

/**
 * The placement of a proposal on its way back: returned, or handed in again and not decided yet
 * (ADR 0036). The editor does not list it; `restoreHeld` writes it back.
 */
export interface HeldRow {
  readonly row: OutlineRow;
  /** The rows it stood after, nearest first. */
  readonly after: readonly string[];
}

export interface Merged {
  readonly outline: Outline;
  /** Placed proposals now returned, rejected or withdrawn: the preflight warning `proposal-dropped`. */
  readonly dropped: readonly DroppedProposal[];
  readonly held: readonly HeldRow[];
}

const REPORTED: ReadonlySet<PointState> = new Set(['returned', 'rejected', 'withdrawn']);
const COMING_BACK: ReadonlySet<PointState> = new Set(['returned', 'draft', 'submitted']);

/**
 * Placed rows whose point is eligible keep their place; others disappear. Silently when the point
 * is published or gone (V5), reported when it went back to the author or out. Eligible proposals
 * nobody placed come last in their section, by `submittedAt` and then id. A placement whose point
 * is back with its author is held, to be written back (ADR 0036).
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
  const held: HeldRow[] = [];
  const merged = {} as { -readonly [S in OutlineSection]: OutlineRow[] };
  for (const section of SECTIONS) {
    const kept: OutlineRow[] = [];
    for (const row of outline[section]) {
      const pointId = row.sourcePointId;
      if (pointId === null || open.has(pointId)) {
        if (pointId !== null) placed.add(pointId);
        kept.push(row);
        continue;
      }
      const state = states.get(pointId);
      if (state === undefined) continue;
      if (REPORTED.has(state)) dropped.push({ pointId, section, state });
      if (COMING_BACK.has(state)) held.push({ row, after: kept.map((r) => r.lineageId).reverse() });
    }
    merged[section] = kept;
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
  return { outline: merged, dropped, held };
}

/**
 * The outline as it is written: each held row back in its section, after the nearest row it stood
 * after that is still there, else at the top. Refused when a section would hold more rows than its
 * bound, counted as stored (a new proposal row is not).
 */
export function restoreHeld(outline: Outline, held: readonly HeldRow[]): OutlineResult {
  if (held.length === 0) return { ok: true, outline };
  const restored = {} as { -readonly [S in OutlineSection]: OutlineRow[] };
  for (const section of SECTIONS) {
    const rows = outline[section];
    const present = new Set(rows.map((r) => r.lineageId));
    const byAnchor = new Map<string | null, OutlineRow[]>();
    for (const { row, after } of held) {
      if (row.section !== section) continue;
      const anchor = after.find((id) => present.has(id)) ?? null;
      byAnchor.set(anchor, [...(byAnchor.get(anchor) ?? []), row]);
    }
    const written = [
      ...(byAnchor.get(null) ?? []),
      ...rows.flatMap((r) => [r, ...(byAnchor.get(r.lineageId) ?? [])]),
    ];
    if (written.filter((r) => !r.isNew).length > OUTLINE_LIMITS.rowsPerSection) {
      return { ok: false, refusal: 'outline-full' };
    }
    restored[section] = written;
  }
  return { ok: true, outline: restored };
}
