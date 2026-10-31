import type { z } from 'zod';

import type { setSkippedInput } from '@/contracts';
import { issues } from '@/ui/copy';
import { flagOf, type FormSpec } from '@/ui/form';

const { skip, unskip, unconfirmed, meeting, stale } = issues.strip;
const COPY = { skip, unskip } as const;

/** The id of a slot's skip form, and with it the heading that names it. */
export const skipFormId = (monday: string): string => `porada-skip-${monday}`;

/** The spec of the confirmed skip form; `monday` has no control, it only owns the stale message. */
export function skipSpec(event: 'skip' | 'unskip', label: string): FormSpec {
  return {
    confirmed: { label: COPY[event].confirm, required: true, messages: { required: unconfirmed } },
    monday: { label: meeting(label), messages: { invalid: stale } },
  };
}

/** What the form sends: the version only for a slot with a row, `confirmed` only when ticked. */
export function skipInput(
  monday: string,
  event: 'skip' | 'unskip',
  version: number | null,
  data: FormData,
): z.input<typeof setSkippedInput> {
  return {
    monday,
    event,
    ...(version !== null && { expectedVersion: version }),
    ...(flagOf(data, 'confirmed') && { confirmed: true as const }),
  };
}
