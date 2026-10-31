import type { z } from 'zod';

import type {
  issueAnnex2Input,
  issueDetailsInput,
  issueTextsWriteOutput,
  ServerAction,
} from '@/contracts';
import { richDocOf, textOf } from '@/ui/form';

import { versioned } from './outline';

export type DetailsAction = ServerAction<
  z.input<typeof issueDetailsInput>,
  z.output<typeof issueTextsWriteOutput>
>;

export type Annex2Action = ServerAction<
  z.input<typeof issueAnnex2Input>,
  z.output<typeof issueTextsWriteOutput>
>;

export const detailsInput =
  (monday: string, version: number | null) =>
  (data: FormData): z.input<typeof issueDetailsInput> => ({
    monday,
    present: textOf(data, 'present'),
    guests: textOf(data, 'guests'),
    ...versioned(version),
  });

/** „Uložit“ sends the editor's document. */
export const annex2Input =
  (monday: string, version: number | null) =>
  (data: FormData): z.input<typeof issueAnnex2Input> => ({
    monday,
    body: richDocOf(data, 'body'),
    ...versioned(version),
  });

/** „Odebrat přílohu“ sends an empty document, which the porada stores as no Příloha 2. */
export const removeAnnex2Input =
  (monday: string, version: number | null) => (): z.input<typeof issueAnnex2Input> => ({
    monday,
    body: { type: 'doc', content: [] },
    ...versioned(version),
  });
