import { stripKeys, type KeyedBullet } from './bullet-chips';
import { campusOf, pickedTime, typedDate, type PointContentWire } from './fields';

export type Patch = Partial<PointContentWire>;

/** The editor fields that take text, a date, a time or a campus choice from a control. */
export type PatchName =
  'title' | 'eventDate' | 'endDate' | 'timeFrom' | 'timeTo' | 'campus' | 'place';

/**
 * What a control's new value does to the content: the patch for the field named `name`.
 * A date or time the server would refuse leaves the field as `content` has it.
 */
export function patchFor(name: PatchName, value: string, content: PointContentWire): Patch {
  switch (name) {
    case 'title':
      return { title: value };
    case 'eventDate':
    case 'endDate':
      return { [name]: typedDate(value, content[name]).value };
    case 'timeFrom':
    case 'timeTo':
      return { [name]: pickedTime(value, content[name]) };
    case 'campus':
      return { campus: campusOf(value) };
    case 'place':
      return { place: value === '' ? null : value };
  }
}

/** The content with the patch applied; the content it was given stays as it was. */
export function withPatch(content: PointContentWire, patch: Patch): PointContentWire {
  return { ...content, ...patch };
}

/** The patch for new bullets: what the save takes of them, with the chips' keys left out. */
export function bulletsPatch(bullets: readonly KeyedBullet[]): Patch {
  return { bullets: stripKeys(bullets) };
}

/** What the editor holds: the content as the save takes it, and the bullets as the rows edit them. */
export interface Edit {
  readonly content: PointContentWire;
  readonly bullets: readonly KeyedBullet[];
}

type Statements = readonly PointContentWire['statements'][number][];

/** Whether two lists hold the very same items in the same order. */
function sameItems<T>(a: readonly T[], b: readonly T[]): boolean {
  return a.length === b.length && a.every((item, i) => item === b[i]);
}

/**
 * The edit after a change to the bullets, `update` applied to the edit's own bullets (not
 * to what a render last showed, so two changes in one tick both stay), with the content
 * following them. A change that leaves every bullet as it was (a refused add, a copy)
 * hands back the very edit it was given, so the caller can tell nothing changed.
 */
export function bulletsEdit(
  edit: Edit,
  update: (previous: readonly KeyedBullet[]) => KeyedBullet[],
): Edit {
  const bullets = update(edit.bullets);
  if (sameItems(bullets, edit.bullets)) return edit;
  return { content: withPatch(edit.content, bulletsPatch(bullets)), bullets };
}

/**
 * The edit after a change to the statements, `update` applied to the edit's own statements.
 * Like `bulletsEdit`, a change that leaves every statement as it was hands back the very edit.
 */
export function statementsEdit(edit: Edit, update: (previous: Statements) => Statements): Edit {
  const statements = update(edit.content.statements);
  if (sameItems(statements, edit.content.statements)) return edit;
  return { ...edit, content: withPatch(edit.content, { statements: [...statements] }) };
}
