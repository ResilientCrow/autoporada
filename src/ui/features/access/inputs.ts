import type { z } from 'zod';

import type { requestAccessInput } from '@/contracts';
import { textOf } from '@/ui/form';

/** What „Odeslat žádost“ sends: the reason as typed; the server trims and checks it. */
export function requestInput(data: FormData): z.input<typeof requestAccessInput> {
  return { reason: textOf(data, 'reason') };
}
