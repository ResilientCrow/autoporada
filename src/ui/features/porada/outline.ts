import type { z } from 'zod';

import type {
  outlineAddInput,
  outlineMoveInput,
  outlineRemoveInput,
  outlineSaveInput,
  outlineWriteOutput,
  ServerAction,
} from '@/contracts';
import { choiceOf, textOf } from '@/ui/form';

type Action<In extends z.ZodType> = ServerAction<z.input<In>, z.output<typeof outlineWriteOutput>>;

export type OutlineAddAction = Action<typeof outlineAddInput>;
export type OutlineMoveAction = Action<typeof outlineMoveInput>;
export type OutlineRemoveAction = Action<typeof outlineRemoveInput>;
export type OutlineSaveAction = Action<typeof outlineSaveInput>;

/** The three actions of the list. */
export interface OutlineActions {
  readonly add: OutlineAddAction;
  readonly move: OutlineMoveAction;
  readonly remove: OutlineRemoveAction;
}

export type OutlineSectionKey = 'pokyny' | 'hospodareni';

/** One item of a section as the list shows it. */
export interface OutlineRowView {
  readonly lineageId: string;
  /** Set on a slot the document makes itself. */
  readonly slot: string | null;
  readonly persistence: 'standing' | 'once';
  /** A proposal row shows its point's title. */
  readonly title: string;
  readonly proposal: { readonly pointId: string; readonly isNew: boolean } | null;
}

/** The page's list and the version of the porada's row it was read at. */
export interface OutlineView {
  readonly monday: string;
  /** Null for a Monday without a row yet (an untouched issue). */
  readonly version: number | null;
  readonly pokyny: readonly OutlineRowView[];
  readonly hospodareni: readonly OutlineRowView[];
}

/** What a write starts from: the version only for a Monday with a row. */
export const versioned = (version: number | null) =>
  version === null ? {} : { expectedVersion: version };

export const moveInput =
  (monday: string, version: number | null, lineageId: string) =>
  (data: FormData): z.input<typeof outlineMoveInput> => ({
    monday,
    lineageId,
    direction: choiceOf(data, 'direction', ['up', 'down']),
    ...versioned(version),
  });

export const removeInput =
  (monday: string, version: number | null, lineageId: string) =>
  (): z.input<typeof outlineRemoveInput> => ({ monday, lineageId, ...versioned(version) });

/** `lineageId` is made once per form, so a retry adds the item once. */
export const addInput =
  (monday: string, version: number | null, section: OutlineSectionKey, lineageId: string) =>
  (data: FormData): z.input<typeof outlineAddInput> => ({
    monday,
    lineageId,
    section,
    title: textOf(data, 'title'),
    persistence: choiceOf(data, 'persistence', ['standing', 'once']),
    ...versioned(version),
  });
