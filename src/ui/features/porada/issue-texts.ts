import type { z } from 'zod';

import type { issueDetailsInput, issueTextsWriteOutput, ServerAction } from '@/contracts';
import { textOf } from '@/ui/form';

import { versioned } from './outline';

export type DetailsAction = ServerAction<
  z.input<typeof issueDetailsInput>,
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
