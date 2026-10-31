import type { PointRecord, Tx } from '@/application/ports';
import {
  derive,
  mergeProposals,
  SECTIONS,
  SEED_OUTLINE,
  type EligibleProposal,
  type HeldRow,
  type Outline,
  type OutlineOrigin,
  type OutlineSection,
} from '@/domain/outline';
import type { PointState } from '@/domain/review';
import type { IssueStatus } from '@/domain/review';
import { isRichDocEmpty, type RichDoc } from '@/domain/richtext';
import type { CalDate } from '@/domain/time';

/** The slot an outline or its texts are read for; `id` is null for a Monday with no row yet. */
export interface OutlineIssue {
  readonly id: string | null;
  readonly monday: CalDate;
}

export interface LoadedOutline {
  readonly outline: Outline;
  readonly origin: OutlineOrigin;
  /** Status of the issue the outline was derived from; null when stored or seeded. */
  readonly sourceStatus: IssueStatus | null;
}

const size = (outline: Outline) => outline.pokyny.length + outline.hospodareni.length;

/**
 * The outline of an issue: its stored rows, or, while it has none, the outline derived from the
 * latest earlier issue that has rows (the seed when there is none). A read never writes the
 * derived outline; the first outline write does (ADR 0030 item 3).
 */
export async function loadOutline(tx: Tx, issue: OutlineIssue): Promise<LoadedOutline> {
  if (issue.id !== null) {
    const stored = await tx.issueItems.forIssue(issue.id);
    if (size(stored) > 0)
      return { outline: stored, origin: { kind: 'stored' }, sourceStatus: null };
  }
  const source = await tx.issueItems.latestSourceBefore(issue.monday);
  return { ...derive(source, SEED_OUTLINE), sourceStatus: source?.status ?? null };
}

const SECTION_OF = { finance: 'hospodareni', pokyn: 'pokyny' } as const;

/** The approved proposals that may stand in the outline; a report is never one. */
export function eligibleProposals(points: readonly PointRecord[]): readonly EligibleProposal[] {
  return points.flatMap((p) =>
    p.kind === 'report'
      ? []
      : [
          {
            pointId: p.id,
            section: SECTION_OF[p.kind],
            submittedAt: p.submittedAt ?? p.updatedAt,
          },
        ],
  );
}

/** The points placed in `outline` that are not among `proposals`, as far as the read scope shows them. */
export async function placedElsewhere(
  tx: Tx,
  outline: Outline,
  proposals: readonly PointRecord[],
): Promise<ReadonlyMap<string, PointRecord>> {
  const eligible = new Set(proposals.map((p) => p.id));
  const found = new Map<string, PointRecord>();
  for (const section of SECTIONS) {
    for (const row of outline[section]) {
      if (row.sourcePointId === null || eligible.has(row.sourcePointId)) continue;
      const point = await tx.points.get(row.sourcePointId);
      if (point) found.set(point.id, point);
    }
  }
  return found;
}

export interface EditableOutline extends LoadedOutline {
  /** Placements of proposals back with their authors: not listed, written back (ADR 0036). */
  readonly held: readonly HeldRow[];
}

/**
 * The outline an editor works on: `loadOutline` merged with the approved proposals, so a proposal
 * nobody placed yet is a row that can be moved. A placement whose point is back with its author is
 * held; any other whose point went out of the running is dropped, and the next write forgets it.
 */
export async function loadEditable(
  tx: Tx,
  issue: OutlineIssue,
  proposals: readonly PointRecord[],
): Promise<EditableOutline> {
  const loaded = await loadOutline(tx, issue);
  const elsewhere = await placedElsewhere(tx, loaded.outline, proposals);
  const states = new Map<string, PointState>([...elsewhere].map(([id, p]) => [id, p.state]));
  const merged = mergeProposals(loaded.outline, eligibleProposals(proposals), states);
  return { ...loaded, outline: merged.outline, held: merged.held };
}

/**
 * Makes `outline` the issue's rows, in order. A proposal nobody placed (a virtual row) is not
 * written; the caller has taken the issue's version and read the deadline rule first.
 */
export async function writeOutline(tx: Tx, issueId: string, outline: Outline): Promise<void> {
  const stored = (rows: Outline[OutlineSection]) => rows.filter((row) => row.isNew !== true);
  await tx.issueItems.replace(issueId, {
    pokyny: stored(outline.pokyny),
    hospodareni: stored(outline.hospodareni),
  });
}

/** Přítomni, Hosté and Příloha 2 as the document prints them (D8, U1). */
export interface IssueTextValues {
  readonly present: string;
  readonly guests: string;
  /** Null: no Příloha 2 (never written anywhere, or an empty doc). */
  readonly annex2: RichDoc | null;
}

const NO_TEXTS = { present: null, guests: null, annex2: null };

/**
 * Each text is the issue's own when it has one (an empty string or an empty doc is a value: a
 * cleared text stays cleared), else the latest earlier issue's that has one, else empty.
 */
export async function loadTexts(tx: Tx, issue: OutlineIssue): Promise<IssueTextValues> {
  const own = issue.id === null ? NO_TEXTS : await tx.issueItems.textsOf(issue.id);
  const complete = own.present !== null && own.guests !== null && own.annex2 !== null;
  const carried = complete ? NO_TEXTS : await tx.issueItems.latestTextsBefore(issue.monday);
  const annex2 = own.annex2 ?? carried.annex2;
  return {
    present: own.present ?? carried.present ?? '',
    guests: own.guests ?? carried.guests ?? '',
    annex2: annex2 && !isRichDocEmpty(annex2) ? annex2 : null,
  };
}
