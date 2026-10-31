import type { Tx } from '@/application/ports';
import { derive, SEED_OUTLINE, type Outline, type OutlineOrigin } from '@/domain/outline';
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
    if (size(stored) > 0) return { outline: stored, origin: { kind: 'stored' }, sourceStatus: null };
  }
  const source = await tx.issueItems.latestSourceBefore(issue.monday);
  return { ...derive(source, SEED_OUTLINE), sourceStatus: source?.status ?? null };
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
