import { z } from 'zod';

import { renderPeople, responsibleVerb } from '@/domain/cs';

import {
  campus,
  dated,
  person,
  refineSnapshot,
  required,
  snapshotFields,
  text,
  title,
} from './shape';

/**
 * Schema 1 of the snapshot, read only to be upcast (ADR 0060): a future item named its people as
 * structured data. A document generated under it stays readable by turning that into the
 * organizer text the same code used to print.
 */
const futureItemV1 = z.strictObject({
  id: required,
  kind: z.enum(['jednani', 'akce']),
  title,
  ...dated,
  campus: campus.optional(),
  place: text.optional(),
  /** „za Next Zone Event Space koordinuje absolvent pan Jan Novák“ */
  responsible: z
    .strictObject({
      verb: z.enum(['organizuje', 'koordinuje', 'zajišťuje', 'vede']),
      /** „za …“: the organisation the people act for. */
      behalfOf: title.optional(),
      people: z.array(person.extend({ role: text.optional() })).min(1),
    })
    .optional(),
});

const snapshotV1 = z
  .strictObject({ schema: z.literal(1), ...snapshotFields(futureItemV1) })
  .superRefine(refineSnapshot);

type FutureItemV1 = z.output<typeof futureItemV1>;

/** „za Next Zone Event Space koordinuje absolvent pan Jan Novák“, or nothing: the line schema 1 printed. */
function organizerOf(
  item: FutureItemV1,
  groupOrder: readonly ('pan' | 'pani' | 'slecna')[] | undefined,
): string | undefined {
  const r = item.responsible;
  if (!r) return undefined;
  const people = renderPeople(r.people, {
    join: 'and',
    order: 'input',
    ...(groupOrder && { groupOrder }),
  });
  return [r.behalfOf && `za ${r.behalfOf}`, responsibleVerb(r.verb, r.people.length), people]
    .filter(Boolean)
    .join(' ');
}

export type UpcastResult =
  | { readonly ok: true; readonly input: unknown }
  | { readonly ok: false; readonly errors: readonly string[] };

/**
 * A stored schema 1 snapshot as schema 2 input: it must be a valid schema 1 first. Only the
 * future items change, `responsible` becoming `organizer`; everything else is passed through
 * untouched for the schema 2 parse.
 */
export function upcastV1(input: unknown): UpcastResult {
  const parsed = snapshotV1.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
    };
  }
  const old = parsed.data;
  const raw = input as { futureItems: readonly Record<string, unknown>[] };
  const futureItems = raw.futureItems.map((rawItem, i) => {
    const { responsible: _dropped, ...rest } = rawItem;
    const organizer = organizerOf(old.futureItems[i]!, old.options.groupOrder);
    return organizer ? { ...rest, organizer } : rest;
  });
  return { ok: true, input: { ...raw, schema: 2, futureItems } };
}
