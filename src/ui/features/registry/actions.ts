import type { z } from 'zod';

import type {
  addEntriesInput,
  addEntriesOutput,
  moveListInput,
  moveListOutput,
  previewPasteInput,
  previewPasteOutput,
  removeEntryInput,
  removeEntryOutput,
  saveEntryInput,
  saveEntryOutput,
  saveListInput,
  saveListOutput,
  ServerAction,
} from '@/contracts';

type Action<In extends z.ZodType, Out extends z.ZodType> = ServerAction<z.input<In>, z.output<Out>>;

export type AddEntriesAction = Action<typeof addEntriesInput, typeof addEntriesOutput>;
export type SaveEntryAction = Action<typeof saveEntryInput, typeof saveEntryOutput>;
export type RemoveEntryAction = Action<typeof removeEntryInput, typeof removeEntryOutput>;
export type SaveListAction = Action<typeof saveListInput, typeof saveListOutput>;
export type MoveListAction = Action<typeof moveListInput, typeof moveListOutput>;
export type PreviewPasteAction = Action<typeof previewPasteInput, typeof previewPasteOutput>;
