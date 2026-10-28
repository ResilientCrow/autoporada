import type { PointContent } from './content';

/** The fields of a point's content a person writes: every one but the flag `openingEdited`. */
export type PointFieldValues = Omit<PointContent, 'openingEdited'>;
export type PointField = keyof PointFieldValues;

/** Every field once, in the content's order: the compiler refuses a missing or an unknown one. */
const FIELD_SET: Readonly<Record<PointField, true>> = {
  title: true,
  eventDate: true,
  endDate: true,
  timeFrom: true,
  timeTo: true,
  campus: true,
  place: true,
  opening: true,
  body: true,
  bullets: true,
  statements: true,
};
// String keys keep the order they were written in.
const FIELDS = Object.keys(FIELD_SET) as PointField[];

/** An object's own keys whose value is set: a missing optional value and an `undefined` one are alike. */
const setKeys = (value: object): string[] =>
  Object.entries(value)
    .filter(([, v]) => v !== undefined)
    .map(([key]) => key)
    .sort();

/** Whether two JSON-like values are equal by value: arrays in order, objects by their set keys. */
function same(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((item, i) => same(item, b[i]))
    );
  }
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  const keys = setKeys(a);
  const other = setKeys(b);
  const aRecord = new Map(Object.entries(a));
  const bRecord = new Map(Object.entries(b));
  return (
    keys.length === other.length &&
    keys.every((key, i) => key === other[i] && same(aRecord.get(key), bRecord.get(key)))
  );
}

/**
 * The fields a review edit changed (design section 10), in the content's order: values compared by
 * value, so a copy of the same bullets is no change, while bullets, people or statements in another
 * order are. The flag `openingEdited` is never named: it follows the opening sentence.
 */
export function diffPointFields(before: PointContent, after: PointContent): PointField[] {
  return FIELDS.filter((field) => !same(before[field], after[field]));
}

function copyField<K extends PointField>(
  to: Partial<PointFieldValues>,
  from: PointFieldValues,
  field: K,
): void {
  to[field] = from[field];
}

/** The values of exactly `fields` in `content`: what a review edit keeps as „Původní znění“ (D13). */
export function pointFieldValues(
  content: PointFieldValues,
  fields: readonly PointField[],
): Partial<PointFieldValues> {
  const values: Partial<PointFieldValues> = {};
  for (const field of fields) copyField(values, content, field);
  return values;
}
