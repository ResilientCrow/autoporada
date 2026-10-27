import { normalizeClass, schoolYear, type Salutation } from '@/domain/cs';
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

export type ChipButton = 'edit' | 'remove' | 'up' | 'down';

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

/** The fields that block „Hotovo“, by name. */
type Issues = Readonly<Record<string, 'required'>>;

export type Finished =
  | { readonly ok: true; readonly chips: readonly Chip[]; readonly focus: Focus }
  | { readonly ok: false; readonly issues: Issues };

/**
 * The open editor: whose it is, and the class as it stood when it opened or
 * was last settled (written the way the lists write it), which is what a
 * changed class is compared with.
 */
export interface Editing {
  readonly key: string;
  readonly klass: string | undefined;
}

/** The editor after Upravit: the chips as the closed editor left them, and which editor is open now. */
export type Switched =
  | { readonly ok: true; readonly chips: readonly Chip[]; readonly editing: Editing | null }
  | { readonly ok: false; readonly issues: Issues };

/** The chips and the editor after the class field was left. */
export interface Settled {
  readonly chips: readonly Chip[];
  readonly editing: Editing | null;
}

/** What a chip asks the author to look at. */
export type Flag = 'salutation' | 'class';

/** The fields of the editor; an empty text is an absent field. */
export interface Fields {
  readonly salutation: Salutation | null;
  readonly affiliation: string;
  readonly givenName: string;
  readonly familyName: string;
  readonly titlesBefore: string;
  readonly titlesAfter: string;
}

const NO_CHANGE = (chips: readonly Chip[]): Change => ({ chips, focus: null, say: null });

/** Adds `person` under `key`, unless the field already holds `limit` people. */
export function addChip(
  chips: readonly Chip[],
  person: DraftPerson,
  key: string,
  limit: number,
): Added {
  if (chips.length >= limit) return { ok: false, code: 'limit' };
  return { ok: true, chips: [...chips, { key, person }], say: addedMessage(person, chips.length) };
}

/** A batch add: the chips, the new ones among them, where focus goes, and how many fitted or not. */
export interface AddedMany {
  readonly chips: readonly Chip[];
  /** The chips this add made, in the order given. */
  readonly fresh: readonly Chip[];
  /** The key of the first new chip, for focus; null when nothing was added. */
  readonly first: string | null;
  readonly added: number;
  readonly refused: number;
}

/**
 * Adds a list of people the author has just typed or pasted, as many as the
 * room under `limit` holds (the first ones; the rest are `refused`, never
 * cut mid-way). A class they brought is the author's own current knowledge, so
 * it is written the way the lists write it and dated this school year, which
 * leaves it unflagged. Their salutation stays as it is.
 */
export function addChips(
  chips: readonly Chip[],
  people: readonly DraftPerson[],
  keys: readonly string[],
  limit: number,
  today: CalDate,
): AddedMany {
  const room = Math.max(0, limit - chips.length);
  const taken = people.slice(0, Math.min(room, keys.length));
  const fresh = taken.map((person, i) => ({
    key: keys[i] ?? '',
    person: settled(person, undefined, today),
  }));
  return {
    chips: fresh.length === 0 ? chips : [...chips, ...fresh],
    fresh,
    first: fresh[0]?.key ?? null,
    added: fresh.length,
    refused: people.length - fresh.length,
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
 * Moves a chip one place. At an end nothing moves, but the place is said again
 * so the press is not met with silence. Focus stays on the button.
 */
export function moveChip(chips: readonly Chip[], key: string, by: -1 | 1): Change {
  const at = chips.findIndex((chip) => chip.key === key);
  const chip = chips[at];
  if (chip === undefined) return NO_CHANGE(chips);
  const button: ChipButton = by < 0 ? 'up' : 'down';
  const target = at + by;
  const focus = { key, button };
  if (target < 0 || target >= chips.length) {
    return { chips, focus, say: movedMessage(chip.person, at + 1, chips.length) };
  }
  const moved = chips.filter((_, i) => i !== at);
  moved.splice(target, 0, chip);
  return { chips: moved, focus, say: movedMessage(chip.person, target + 1, chips.length) };
}

function change(
  chips: readonly Chip[],
  key: string,
  update: (person: DraftPerson) => DraftPerson,
): readonly Chip[] {
  return chips.map((chip) => (chip.key === key ? { key, person: update(chip.person) } : chip));
}

/** An optional field with no text is not kept as an empty string. */
function optional(
  person: DraftPerson,
  field: 'titlesBefore' | 'titlesAfter' | 'affiliation',
  text: string,
): DraftPerson {
  const next: { -readonly [K in keyof DraftPerson]: DraftPerson[K] } = { ...person };
  if (text === '') delete next[field];
  else next[field] = text;
  return next;
}

const withoutYear = ({ affiliationYear: _year, ...rest }: DraftPerson): DraftPerson => rest;

/** Sets editor fields on one chip. An emptied class takes its confirmed year with it. */
export function editChip(
  chips: readonly Chip[],
  key: string,
  patch: Partial<Fields>,
): readonly Chip[] {
  return change(chips, key, (before) => {
    let person = before;
    if (patch.salutation !== undefined) person = { ...person, salutation: patch.salutation };
    if (patch.givenName !== undefined) person = { ...person, givenName: patch.givenName };
    if (patch.familyName !== undefined) person = { ...person, familyName: patch.familyName };
    if (patch.titlesBefore !== undefined)
      person = optional(person, 'titlesBefore', patch.titlesBefore);
    if (patch.titlesAfter !== undefined)
      person = optional(person, 'titlesAfter', patch.titlesAfter);
    if (patch.affiliation !== undefined) {
      person = optional(person, 'affiliation', patch.affiliation);
      if (patch.affiliation === '') person = withoutYear(person);
    }
    return person;
  });
}

/** A class as the lists write it („3b“ is „3.B“, an organisation is only trimmed); none when empty. */
function classOf(person: DraftPerson): string | undefined {
  const text = (person.affiliation ?? '').trim();
  return text === '' ? undefined : normalizeClass(text);
}

/**
 * The class of a person once the author has left the field. A class the author
 * typed or changed is current by definition, so it is dated this school year;
 * one left as it was keeps its date, and the flag stays until „Třída platí“.
 * Emptying it drops the class and its year.
 */
function settled(person: DraftPerson, previous: string | undefined, today: CalDate): DraftPerson {
  const klass = classOf(person);
  const { affiliation: _class, ...rest } = withoutYear(person);
  if (klass === undefined) return rest;
  const year = klass === previous ? person.affiliationYear : schoolYear(today);
  return { ...rest, affiliation: klass, ...(year === undefined ? {} : { affiliationYear: year }) };
}

/** Opens the editor of `key`, noting the class it opens with. */
function open(chips: readonly Chip[], key: string): Editing {
  const chip = chips.find((c) => c.key === key);
  return { key, klass: chip === undefined ? undefined : classOf(chip.person) };
}

/** On leaving the class field: written the way the lists do, and dated if the author changed it. */
export function settleClass(
  chips: readonly Chip[],
  editing: Editing | null,
  today: CalDate,
): Settled {
  const chip = editing === null ? undefined : chips.find((c) => c.key === editing.key);
  if (editing === null || chip === undefined) return { chips, editing };
  if (chip.person.affiliation === undefined) {
    return {
      chips,
      editing: editing.klass === undefined ? editing : { ...editing, klass: undefined },
    };
  }
  const person = settled(chip.person, editing.klass, today);
  return {
    chips: change(chips, editing.key, () => person),
    editing: { ...editing, klass: person.affiliation },
  };
}

/** „Třída platí“: the class was checked this school year. */
export function confirmClass(chips: readonly Chip[], key: string, today: CalDate): readonly Chip[] {
  const chip = chips.find((c) => c.key === key);
  if (chip?.person.affiliation === undefined) return chips;
  return change(chips, key, (person) => ({ ...person, affiliationYear: schoolYear(today) }));
}

/**
 * „Hotovo“: trims the fields, writes the class the way the lists do (and dates
 * it if the author changed it), and closes the editor, focus back on the
 * chip's Upravit. An empty given name or surname keeps it open and names the
 * fields.
 */
export function finishEdit(chips: readonly Chip[], editing: Editing, today: CalDate): Finished {
  const chip = chips.find((c) => c.key === editing.key);
  if (chip === undefined) return { ok: false, issues: {} };
  const { person } = chip;
  const text = (value: string | undefined) => (value ?? '').trim();
  const issues = {
    ...(text(person.givenName) === '' ? { givenName: 'required' as const } : {}),
    ...(text(person.familyName) === '' ? { familyName: 'required' as const } : {}),
  };
  if (Object.keys(issues).length > 0) return { ok: false, issues };
  const trimmed = optional(
    optional(
      { ...person, givenName: text(person.givenName), familyName: text(person.familyName) },
      'titlesBefore',
      text(person.titlesBefore),
    ),
    'titlesAfter',
    text(person.titlesAfter),
  );
  return {
    ok: true,
    chips: change(chips, editing.key, () => settled(trimmed, editing.klass, today)),
    focus: { key: editing.key, button: 'edit' },
  };
}

/**
 * Upravit on `key`. The editor that is open is finished first, so closing it
 * and switching away from it leave the same fields as „Hotovo“: trimmed, the
 * class written out. When it cannot be finished (a name is empty) it stays
 * open and nothing switches. Its own button closes it; another's opens that one.
 */
export function switchEditor(
  chips: readonly Chip[],
  editing: Editing | null,
  key: string,
  today: CalDate,
): Switched {
  let current = chips;
  if (editing !== null && chips.some((chip) => chip.key === editing.key)) {
    const finished = finishEdit(chips, editing, today);
    if (!finished.ok) return finished;
    current = finished.chips;
  }
  return { ok: true, chips: current, editing: editing?.key === key ? null : open(current, key) };
}

/**
 * The bulk setter: only chips with no salutation get one. The offer is gone
 * after it, so focus goes to the Upravit of the first chip that was set, not to
 * the search box, whose list would open over the chips just changed.
 */
export function salutateAll(chips: readonly Chip[], salutation: Salutation): Change {
  const lacking = chips.filter((chip) => chip.person.salutation === null);
  const first = lacking[0];
  if (first === undefined) return NO_CHANGE(chips);
  return {
    chips: chips.map((chip) =>
      chip.person.salutation === null ? { ...chip, person: { ...chip.person, salutation } } : chip,
    ),
    focus: { key: first.key, button: 'edit' },
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

/** What is said after a move; `place` counts from one. */
export function movedMessage(person: DraftPerson, place: number, total: number): string {
  return people.chips.moved(spokenName(person), place, total);
}

/** What is said after the bulk setter; `count` is the people it set. */
export function salutatedMessage(count: number): string {
  return people.chips.bulk.done(count);
}
