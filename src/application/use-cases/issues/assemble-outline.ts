import type { PointRecord, Tx } from '@/application/ports';
import { mergeProposals, SECTIONS, type Outline, type OutlineSection } from '@/domain/outline';
import type { PointState } from '@/domain/review';
import { emptyRichDoc, isRichDocEmpty, singleLine } from '@/domain/richtext';
import type { SnapshotItem } from '@/snapshot';

import type { DroppedRef } from './assemble-types';
import {
  eligibleProposals,
  loadOutline,
  type LoadedOutline,
  type OutlineIssue,
} from './outline-store';

type Items = { readonly [S in OutlineSection]: readonly SnapshotItem[] };

export interface AssembledOutline {
  readonly items: Items;
  readonly dropped: readonly DroppedRef[];
  readonly loaded: LoadedOutline;
  /** Media and partners have nothing in them: the document leaves both out. */
  readonly ohlasyEmpty: boolean;
}

function ohlasyEmpty(outline: Outline): boolean {
  return outline.pokyny.every((row) => {
    if (row.slot === 'media') return row.body === null || isRichDocEmpty(row.body);
    if (row.slot === 'partners') return row.quotes.length === 0;
    return true;
  });
}

/**
 * The stored or derived outline merged with the approved proposals (ADR 0029): a placed proposal
 * keeps its place, an unplaced one comes last, and a placement whose point went back or out is
 * dropped and reported. A proposal row prints its point's title and text.
 */
export async function assembleOutline(
  tx: Tx,
  issue: OutlineIssue,
  proposals: readonly PointRecord[],
): Promise<AssembledOutline> {
  const loaded = await loadOutline(tx, issue);
  const byId = new Map(proposals.map((p) => [p.id, p]));
  const eligible = eligibleProposals(proposals);

  // Placed points that are no longer eligible: what became of them decides whether it is reported.
  const states = new Map<string, PointState>();
  const gone = new Map<string, string>();
  for (const section of SECTIONS) {
    for (const row of loaded.outline[section]) {
      if (row.sourcePointId === null || byId.has(row.sourcePointId)) continue;
      const point = await tx.points.get(row.sourcePointId);
      if (!point) continue;
      states.set(point.id, point.state);
      gone.set(point.id, singleLine(point.content.title));
    }
  }

  const merged = mergeProposals(loaded.outline, eligible, states);
  const item = (row: Outline[OutlineSection][number]): SnapshotItem[] => {
    if (row.sourcePointId !== null) {
      const point = byId.get(row.sourcePointId);
      if (!point) return [];
      return [
        {
          title: singleLine(point.content.title),
          slot: null,
          body: point.content.body,
          quotes: [],
        },
      ];
    }
    return [
      {
        title: row.title ?? '',
        slot: row.slot,
        body: row.body ?? emptyRichDoc(),
        quotes: [...row.quotes],
      },
    ];
  };
  return {
    items: {
      pokyny: merged.outline.pokyny.flatMap(item),
      hospodareni: merged.outline.hospodareni.flatMap(item),
    },
    dropped: merged.dropped.map((d) => ({
      id: d.pointId,
      title: gone.get(d.pointId) ?? '',
      state: d.state,
    })),
    loaded,
    ohlasyEmpty: ohlasyEmpty(loaded.outline),
  };
}
