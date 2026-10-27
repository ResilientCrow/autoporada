import { schoolYear, type Salutation } from '@/domain/cs';
import { POINT_LIMITS, type DraftPerson } from '@/domain/report';
import type { CalDate } from '@/domain/time';
import { people } from '@/ui/copy';

import { addedMessage, spokenName } from './directory-state';

/**
 * The chips of a people field (design section 5), as pure steps. Each chip has
 * a key of its own, minted when it is added: neither the array index nor a
 * directory id will do, since people move and a typed person has no id. A step
 * returns the new chips, where focus goes and what is said; the component
 * applies them, so the rules are tested here and the DOM only obeys.
 */
export interface Chip {
  readonly key: string;
  readonly person: DraftPerson;
}

/** How many people a field holds unless its owner says otherwise: what one bullet may hold. */
export const DEFAULT_LIMIT = POINT_LIMITS.peoplePerBullet;

export type ChipButton = 'remove';

/** Where focus goes: a button of one chip, or the search box. */
export type Focus = { readonly key: string; readonly button: ChipButton } | 'search';

/** The outcome of a step: the chips, where focus goes (null: leave it) and what is said (null: nothing). */
export interface Change {
  readonly chips: readonly Chip[];
  readonly focus: Focus | null;
  readonly say: string | null;
}

/** An add, or the code of its refusal at the cap, which the field shows as a notice. */
export type Added =
  | { readonly ok: true; readonly chips: readonly Chip[]; readonly say: string }
  | { readonly ok: false; readonly code: 'limit' };

/** What a chip asks the author to look at. */
export type Flag = 'salutation' | 'class';

const NO_CHANGE = (chips: readonly Chip[]): Change => ({
  chips,
  focus: null,
  say: null,
});

/** Adds `person` under `key`, unless the field already holds `limit` people. */
export function addChip(
  chips: readonly Chip[],
  person: DraftPerson,
  key: string,
  limit: number,
): Added {
  if (chips.length >= limit) return { ok: false, code: 'limit' };
  return {
    ok: true,
    chips: [...chips, { key, person }],
    say: addedMessage(person, chips.length),
  };
}

/**
 * Removes a chip. Focus goes to the next chip's Odebrat, and to the search box
 * when there is no next one: the last chip's removal does not look back.
 */
export function removeChip(chips: readonly Chip[], key: string): Change {
  const at = chips.findIndex((chip) => chip.key === key);
  const gone = chips[at];
  if (gone === undefined) return NO_CHANGE(chips);
  const left = chips.filter((chip) => chip.key !== key);
  const next = left[at];
  return {
    chips: left,
    focus: next === undefined ? 'search' : { key: next.key, button: 'remove' },
    say: removedMessage(gone.person, left.length),
  };
}

/**
 * The bulk setter: only chips with no salutation get one. The offer is gone
 * after it. Focus is left alone here; with the editor (next commit) it goes to
 * the Upravit of the first chip that was set.
 */
export function salutateAll(chips: readonly Chip[], salutation: Salutation): Change {
  const lacking = chips.filter((chip) => chip.person.salutation === null);
  if (lacking.length === 0) return NO_CHANGE(chips);
  return {
    chips: chips.map((chip) =>
      chip.person.salutation === null ? { ...chip, person: { ...chip.person, salutation } } : chip,
    ),
    focus: null,
    say: salutatedMessage(lacking.length),
  };
}

/** The bulk offer: after an insert, for as long as some chip has no salutation. */
export function showsBulk(chips: readonly Chip[], inserted: boolean): boolean {
  return inserted && chips.some((chip) => chip.person.salutation === null);
}

/**
 * What a chip asks the author to look at. A class is stale when it was never
 * confirmed or was confirmed in another school year than `today`'s.
 */
export function flagsOf(person: DraftPerson, today: CalDate): readonly Flag[] {
  const stale = person.affiliation !== undefined && person.affiliationYear !== schoolYear(today);
  return [
    ...(person.salutation === null ? (['salutation'] as const) : []),
    ...(stale ? (['class'] as const) : []),
  ];
}

/** What is said after a removal; `total` no longer counts the person. */
export function removedMessage(person: DraftPerson, total: number): string {
  return people.chips.removed(spokenName(person), total);
}

/** What is said after the bulk setter; `count` is the people it set. */
export function salutatedMessage(count: number): string {
  return people.chips.bulk.done(count);
}
