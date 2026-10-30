import type { z } from 'zod';

import type { setRemindersInput } from '@/contracts';
import { flagOf } from '@/ui/form';

/** What „Uložit“ sends: the box as it stands, since a clear box submits no value at all. */
export function remindersInput(data: FormData): z.input<typeof setRemindersInput> {
  return { on: flagOf(data, 'on') };
}
