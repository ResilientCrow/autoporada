import { z } from 'zod';

import { normalizeClass } from '@/domain/cs';
import { isClassCode, PASTE_LIMITS } from '@/domain/registry';
import { hasForbiddenCharacters } from '@/domain/richtext';

const problem = z.enum(['name-missing', 'class-missing', 'class-unknown', 'duplicate']);

/** The paste form: the pasted text (never stored or logged), the list it is for and the name order. */
export const previewPasteInput = z.strictObject({
  listId: z.uuid(),
  text: z.string().max(PASTE_LIMITS.chars),
  order: z.enum(['given-family', 'family-given']),
});

/** The rows the preview table shows; a row with a problem arrives unticked. */
export const previewPasteOutput = z.strictObject({
  rows: z.array(
    z.strictObject({
      source: z.string(),
      givenName: z.string(),
      familyName: z.string(),
      classCode: z.string().nullable(),
      problems: z.array(problem).readonly(),
      warnings: z.array(z.literal('group-count')).readonly(),
    }),
  ),
});

/** A name of a student: trimmed, 1 to 60 characters, none of the invisible or control ones. */
const studentName = z
  .string()
  .trim()
  .min(1)
  .max(60)
  .refine((text) => !hasForbiddenCharacters(text, { allowTab: false }));

/** A class as „1.A“ or „L1B“, written the way the document prints it. */
const classCode = z
  .string()
  .trim()
  .max(12)
  .refine(isClassCode)
  .transform(normalizeClass)
  .pipe(z.string().min(1).max(8));

/** What the entry form and the paste preview send for one student. */
const entryValues = {
  givenName: studentName,
  familyName: studentName,
  classCode,
};

/** `entries`: the list's active students; `fresh`: those never printed. */
const listCount = z.strictObject({ entries: z.int().min(0), fresh: z.int().min(0) });

const listWire = z.strictObject({
  id: z.uuid(),
  key: z.string(),
  title: z.string(),
  docLabel: z.string(),
  purpose: z.enum(['annex1', 'point4']),
  position: z.int(),
  active: z.boolean(),
  version: z.int().positive(),
});

/** The lists with their counts, and with a `key` the list's entries in the document's order. */
export const readRegistryInput = z.strictObject({ key: z.string().max(40).optional() });
export const readRegistryOutput = z.strictObject({
  lists: z.array(listWire.extend(listCount.shape)).readonly(),
  current: z
    .strictObject({
      list: listWire,
      entries: z
        .array(
          z.strictObject({
            id: z.uuid(),
            ...entryValues,
            version: z.int().positive(),
            /** Never printed: the „NOVÉ“ chip. */
            isNew: z.boolean(),
          }),
        )
        .readonly(),
    })
    .nullable(),
});

/** The rows the headmaster ticked in the preview; each is validated again. */
export const addEntriesInput = z.strictObject({
  listId: z.uuid(),
  rows: z.array(z.strictObject(entryValues)).min(1).max(PASTE_LIMITS.rows),
});
export const addEntriesOutput = z.strictObject({ added: z.int().positive() });

/** „Uložit“ of one entry, under the version the form read. */
export const saveEntryInput = z.strictObject({
  id: z.uuid(),
  version: z.int().positive(),
  ...entryValues,
});
export const saveEntryOutput = z.strictObject({
  version: z.int().positive(),
  changed: z.boolean(),
});

export const removeEntryInput = z.strictObject({ id: z.uuid() });
/** `deleted`: the entry was never printed and is gone; else it is kept, marked removed. */
export const removeEntryOutput = z.strictObject({ deleted: z.boolean() });

/**
 * Makes a `point4` list (no `id`) or changes one under the version the form read. The title is
 * what the screen calls the list, the document label what the document does.
 */
export const saveListInput = z.strictObject({
  id: z.uuid().optional(),
  version: z.int().positive().optional(),
  title: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .refine((text) => !hasForbiddenCharacters(text, { allowTab: false })),
  docLabel: z
    .string()
    .trim()
    .min(1)
    .max(300)
    .refine((text) => !hasForbiddenCharacters(text, { allowTab: false })),
  active: z.boolean(),
});
export const saveListOutput = z.strictObject({
  id: z.uuid(),
  version: z.int().positive(),
  changed: z.boolean(),
});

/** One step up or down in the order of the lists. */
export const moveListInput = z.strictObject({
  id: z.uuid(),
  direction: z.enum(['up', 'down']),
});
export const moveListOutput = z.strictObject({ moved: z.boolean() });

/**
 * „Nový školní rok“: the lists ticked, the school year they are archived under (`YYYY/YYYY`, the
 * current one or the one before, checked by the use case) and the confirm box. Unticked is
 * `confirmed: false`, which the use case answers as a missing field.
 */
export const newSchoolYearInput = z.strictObject({
  listIds: z.array(z.uuid()).min(1).max(50).readonly(),
  year: z
    .string()
    .max(9)
    .regex(/^\d{4}\/\d{4}$/),
  confirmed: z.boolean(),
});
/** `archived`: students kept in the archive; `deleted`: students no document had listed. */
export const newSchoolYearOutput = z.strictObject({
  archived: z.int().min(0),
  deleted: z.int().min(0),
});
