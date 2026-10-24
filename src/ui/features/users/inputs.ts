import type { z } from 'zod';

import type { decideAccessInput } from '@/contracts';
import { flagOf } from '@/ui/form';

/**
 * What „Zablokovat další žádosti“ sends. `confirmed` is there only when the box
 * is ticked, so the server, not the form, refuses an unticked one.
 */
export function blockInput(
  requestId: string,
  version: number,
  data: FormData,
): z.input<typeof decideAccessInput> {
  return {
    requestId,
    version,
    decision: 'block',
    ...(flagOf(data, 'confirmed') && { confirmed: true as const }),
  };
}
