import type { z } from 'zod';

import type { ServerAction, setPlaceholderInput, setPlaceholderOutput } from '@/contracts';
import { textOf } from '@/ui/form';

export type PlaceholderAction = ServerAction<
  z.input<typeof setPlaceholderInput>,
  z.output<typeof setPlaceholderOutput>
>;

/** „Uložit“ sends the paragraph as typed; the use case trims it and joins its lines. */
export const savePlaceholderInput =
  (monday: string, itemId: string, version: number) =>
  (data: FormData): z.input<typeof setPlaceholderInput> => ({
    monday,
    itemId,
    paragraph: textOf(data, 'paragraph'),
    expectedVersion: version,
  });

/** „Obnovit původní text“ sends no paragraph: the akce goes back to the one the system writes. */
export const resetPlaceholderInput =
  (monday: string, itemId: string, version: number) => (): z.input<typeof setPlaceholderInput> => ({
    monday,
    itemId,
    paragraph: null,
    expectedVersion: version,
  });
