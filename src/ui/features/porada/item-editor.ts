import type { z } from 'zod';

import type { outlineAddInput, outlineSaveInput } from '@/contracts';
import type { Statement, SystemSlot } from '@/domain/outline';
import type { RichDoc } from '@/domain/richtext';
import { choiceOf, richDocOf, textOf } from '@/ui/form';

import {
  versioned,
  type OutlineAddAction,
  type OutlineSaveAction,
  type OutlineSectionKey,
} from './outline';

/** The two actions of the item editor. */
export interface ItemActions {
  readonly add: OutlineAddAction;
  readonly save: OutlineSaveAction;
}

/** The porada an item belongs to, as the editor page was read. */
export interface ItemContext {
  /** „pondělí 9. listopadu 2026“. */
  readonly meeting: string;
  readonly monday: string;
  readonly version: number | null;
  /** „2026/2027“. */
  readonly schoolYear: string;
}

/** An item as the editor starts from it. */
export interface ItemView {
  readonly lineageId: string;
  readonly section: OutlineSectionKey;
  readonly slot: SystemSlot | null;
  readonly persistence: 'standing' | 'once';
  readonly title: string;
  readonly body: RichDoc;
  readonly quotes: readonly Statement[];
}

/** A quote while it is typed: every field is text, the affiliation may stay empty. */
export interface QuoteDraft {
  readonly speakerGenitive: string;
  readonly affiliation: string;
  readonly quote: string;
}

const PERSISTENCE = ['standing', 'once'] as const;

export const persistenceOf = (value: string): 'standing' | 'once' =>
  value === 'standing' ? 'standing' : 'once';

export const EMPTY_QUOTE: QuoteDraft = { speakerGenitive: '', affiliation: '', quote: '' };

export const draftOf = (q: Statement): QuoteDraft => ({
  speakerGenitive: q.speakerGenitive,
  affiliation: q.affiliation ?? '',
  quote: q.quote,
});

export const statementOf = (q: QuoteDraft): Statement => ({
  speakerGenitive: q.speakerGenitive,
  ...(q.affiliation.trim() !== '' && { affiliation: q.affiliation }),
  quote: q.quote,
});

/** A slot with a text of its own to write; the meetings and events lists are made by the document. */
export const isGenerated = (slot: SystemSlot | null) => slot === 'meetings' || slot === 'events';

/** The wire form of what the editor sends: the partners slot its quotes, every other item its text. */
function content(slot: SystemSlot | null, data: FormData, quotes: readonly QuoteDraft[]) {
  return slot === 'partners'
    ? { quotes: quotes.map(statementOf) }
    : { body: richDocOf(data, 'body') };
}

export const saveInput =
  (context: ItemContext, version: number | null, item: ItemView, quotes: readonly QuoteDraft[]) =>
  (data: FormData): z.input<typeof outlineSaveInput> => ({
    monday: context.monday,
    lineageId: item.lineageId,
    title: textOf(data, 'title'),
    // A slot stays standing; only an item of the headmaster's own can be made one-off.
    ...(item.slot === null && {
      persistence: choiceOf(data, 'persistence', PERSISTENCE),
    }),
    ...content(item.slot, data, quotes),
    ...versioned(version),
  });

/** `lineageId` is made once per form, so a retry adds the item once. */
export const newInput =
  (context: ItemContext, section: OutlineSectionKey, lineageId: string) =>
  (data: FormData): z.input<typeof outlineAddInput> => ({
    monday: context.monday,
    lineageId,
    section,
    title: textOf(data, 'title'),
    persistence: choiceOf(data, 'persistence', PERSISTENCE),
    body: richDocOf(data, 'body'),
    ...versioned(context.version),
  });
