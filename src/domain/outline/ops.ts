import type { RichDoc } from '@/domain/richtext';

import { OUTLINE_LIMITS } from './limits';
import {
  SECTIONS,
  type Outline,
  type OutlineRow,
  type OutlineSection,
  type Statement,
} from './model';

/** Rule codes an op refuses with (ADR 0030). */
export type OutlineRefusal =
  | 'slot-fixed'
  | 'proposal-fixed'
  | 'outline-full'
  | 'quotes-not-allowed'
  | 'quotes-full'
  | 'item-missing';

export type OutlineResult =
  | { readonly ok: true; readonly outline: Outline }
  | { readonly ok: false; readonly refusal: OutlineRefusal };

const done = (outline: Outline): OutlineResult => ({ ok: true, outline });
const refuse = (refusal: OutlineRefusal): OutlineResult => ({ ok: false, refusal });

export interface NewItem {
  /** Made by the caller: the domain has no randomness. */
  readonly lineageId: string;
  readonly title: string;
  readonly persistence: 'standing' | 'once';
  readonly body: RichDoc;
}

export interface ItemPatch {
  readonly title?: string;
  readonly body?: RichDoc;
  readonly quotes?: readonly Statement[];
  readonly persistence?: 'standing' | 'once';
}

function find(outline: Outline, lineageId: string) {
  for (const section of SECTIONS) {
    const index = outline[section].findIndex((row) => row.lineageId === lineageId);
    if (index >= 0) return { section, index, row: outline[section][index] as OutlineRow };
  }
  return null;
}

function replaceSection(
  outline: Outline,
  section: OutlineSection,
  rows: readonly OutlineRow[],
): Outline {
  return { ...outline, [section]: rows };
}

/** Adds a one-off or standing item at `at` (default: the end of the section). */
export function addItem(
  outline: Outline,
  section: OutlineSection,
  item: NewItem,
  at?: number,
): OutlineResult {
  const rows = outline[section];
  if (rows.length >= OUTLINE_LIMITS.rowsPerSection) return refuse('outline-full');
  const row: OutlineRow = {
    lineageId: item.lineageId,
    section,
    slot: null,
    persistence: item.persistence,
    title: item.title,
    body: item.body,
    quotes: [],
    sourcePointId: null,
  };
  const index = Math.min(Math.max(at ?? rows.length, 0), rows.length);
  return done(
    replaceSection(outline, section, [...rows.slice(0, index), row, ...rows.slice(index)]),
  );
}

export function saveItem(outline: Outline, lineageId: string, patch: ItemPatch): OutlineResult {
  const found = find(outline, lineageId);
  if (!found) return refuse('item-missing');
  const { row, section, index } = found;
  if (row.sourcePointId !== null) return refuse('proposal-fixed');
  if (row.slot !== null && patch.persistence === 'once') return refuse('slot-fixed');
  if (patch.quotes) {
    if (row.slot !== 'partners') return refuse('quotes-not-allowed');
    if (patch.quotes.length > OUTLINE_LIMITS.quotes) return refuse('quotes-full');
  }
  const next: OutlineRow = {
    ...row,
    ...(patch.title !== undefined && { title: patch.title }),
    ...(patch.body !== undefined && { body: patch.body }),
    ...(patch.quotes !== undefined && { quotes: patch.quotes }),
    ...(patch.persistence !== undefined && { persistence: patch.persistence }),
  };
  return done(
    replaceSection(
      outline,
      section,
      outline[section].map((r, i) => (i === index ? next : r)),
    ),
  );
}

/** One step inside the section; at the edge nothing changes. Moving a virtual proposal row places it. */
export function moveItem(
  outline: Outline,
  lineageId: string,
  direction: 'up' | 'down',
): OutlineResult {
  const found = find(outline, lineageId);
  if (!found) return refuse('item-missing');
  const { section, index, row } = found;
  const rows = [...outline[section]];
  const target = direction === 'up' ? index - 1 : index + 1;
  if (target < 0 || target >= rows.length) return done(outline);
  const { isNew: _isNew, ...placed } = row;
  rows[index] = rows[target] as OutlineRow;
  rows[target] = placed;
  return done(replaceSection(outline, section, rows));
}

export function removeItem(outline: Outline, lineageId: string): OutlineResult {
  const found = find(outline, lineageId);
  if (!found) return refuse('item-missing');
  if (found.row.slot !== null) return refuse('slot-fixed');
  if (found.row.sourcePointId !== null) return refuse('proposal-fixed');
  return done(
    replaceSection(
      outline,
      found.section,
      outline[found.section].filter((_, i) => i !== found.index),
    ),
  );
}
