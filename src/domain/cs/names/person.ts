/** Code identifiers for the three formal salutations used in the document. */
export type Salutation = 'pan' | 'pani' | 'slecna';
export type Sex = 'm' | 'f';

export interface PersonName {
  readonly salutation: Salutation;
  /** „Mgr.“, „Ing. arch.“ — written before the name, never declined. */
  readonly titlesBefore?: string;
  /** One or more given names: „Anna Marie“. */
  readonly givenName: string;
  /** May include particles and hyphens: „van Beethoven“, „Nováková-Dvořáková“. */
  readonly familyName: string;
  /** „Ph.D.“, „CSc.“ — written after the name, separated by a comma. */
  readonly titlesAfter?: string;
}

/**
 * The caps of a person's text fields (design §14). The point content's limits
 * reuse them, and the paste parser checks its rows against them, so a pasted
 * row never fails the form's own validation later.
 */
export const PERSON_FIELD_MAX = { name: 80, title: 40, affiliation: 120 } as const;

export const SALUTATION: Readonly<
  Record<Salutation, { label: string; genitive: string; plural: string; sex: Sex }>
> = {
  pan: { label: 'pan', genitive: 'pana', plural: 'pánové', sex: 'm' },
  pani: { label: 'paní', genitive: 'paní', plural: 'paní', sex: 'f' },
  slecna: { label: 'slečna', genitive: 'slečny', plural: 'slečny', sex: 'f' },
};

/** „Mgr. Jan Novák, Ph.D.“ — the name as written in lists (nominative). */
export function formatName(p: PersonName): string {
  const core = [p.titlesBefore, p.givenName, p.familyName].filter(Boolean).join(' ');
  return p.titlesAfter ? `${core}, ${p.titlesAfter}` : core;
}
