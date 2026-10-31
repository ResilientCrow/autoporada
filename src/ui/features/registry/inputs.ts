import { choiceOf, flagOf, textOf } from '@/ui/form';

import type {
  AddEntriesAction,
  MoveListAction,
  PreviewPasteAction,
  RemoveEntryAction,
  SaveEntryAction,
  SaveListAction,
} from './actions';

type Input<A extends (input: never) => unknown> = Parameters<A>[0];

/** One student's three fields, under `prefix` ('' for a form of one entry, `rows.0.` for the add form). */
function entryValues(data: FormData, prefix: string) {
  return {
    givenName: textOf(data, `${prefix}givenName`),
    familyName: textOf(data, `${prefix}familyName`),
    classCode: textOf(data, `${prefix}classCode`),
  };
}

/** „Přidat studenta“: the one row of the add form. */
export const addEntryInput =
  (listId: string) =>
  (data: FormData): Input<AddEntriesAction> => ({
    listId,
    rows: [entryValues(data, 'rows.0.')],
  });

/** „Uložit“ of a student, under the version the row was read at. */
export const saveEntryInput =
  (id: string, version: number) =>
  (data: FormData): Input<SaveEntryAction> => ({ id, version, ...entryValues(data, '') });

export const removeEntryInput = (id: string) => (): Input<RemoveEntryAction> => ({ id });

/**
 * A list's form. The list of Příloha 1 (`locked`) has no switch and stays on; a new list has no
 * `list`.
 */
export const saveListInput =
  (list: { readonly id: string; readonly version: number } | null, locked: boolean) =>
  (data: FormData): Input<SaveListAction> => ({
    ...(list && { id: list.id, version: list.version }),
    title: textOf(data, 'title'),
    docLabel: textOf(data, 'docLabel'),
    active: locked || flagOf(data, 'active'),
  });

export const moveListInput =
  (id: string) =>
  (data: FormData): Input<MoveListAction> => ({
    id,
    direction: choiceOf(data, 'direction', ['up', 'down']),
  });

/** „Zkontrolovat“: the pasted text and the order of the two names. */
export const previewPasteFor =
  (listId: string) =>
  (data: FormData): Input<PreviewPasteAction> => ({
    listId,
    text: textOf(data, 'text'),
    order: choiceOf(data, 'order', ['given-family', 'family-given']),
  });

/** A row of the preview as the add action takes it; only a row with a class can be ticked. */
interface PickableRow {
  readonly givenName: string;
  readonly familyName: string;
  readonly classCode: string | null;
}

/** „Přidat vybrané“: the ticked rows (`pick.<n>`), taken from the preview itself, not from the form. */
export const addPickedInput =
  (listId: string, rows: readonly PickableRow[]) =>
  (data: FormData): Input<AddEntriesAction> => ({
    listId,
    rows: rows.flatMap(({ givenName, familyName, classCode }, i) =>
      flagOf(data, `pick.${i}`) && classCode !== null ? [{ givenName, familyName, classCode }] : [],
    ),
  });
