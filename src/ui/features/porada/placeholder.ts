import type { z } from 'zod';

import type {
  confirmPlaceholderInput,
  confirmPlaceholderOutput,
  ServerAction,
  setPlaceholderInput,
  setPlaceholderOutput,
} from '@/contracts';
import { textOf } from '@/ui/form';

export type PlaceholderAction = ServerAction<
  z.input<typeof setPlaceholderInput>,
  z.output<typeof setPlaceholderOutput>
>;

export type ConfirmPlaceholderAction = ServerAction<
  z.input<typeof confirmPlaceholderInput>,
  z.output<typeof confirmPlaceholderOutput>
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

/** „Zkontrolováno“ names the placeholder and akce versions the page read (ADR 0061). */
export const checkPlaceholderInput =
  (monday: string, itemId: string, version: number, akceVersion: number) =>
  (): z.input<typeof confirmPlaceholderInput> => ({
    monday,
    itemId,
    expectedVersion: version,
    akceVersion,
  });
