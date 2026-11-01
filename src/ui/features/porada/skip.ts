import type { z } from 'zod';

import type { setSkippedInput } from '@/contracts';
import { issues, porada } from '@/ui/copy';
import { flagOf, textOf, type FormSpec } from '@/ui/form';

const { skip, unskip, unconfirmed, meeting, stale } = issues.strip;
const COPY = { skip, unskip } as const;

/** The id of a slot's skip form, and with it the heading that names it. */
export const skipFormId = (monday: string): string => `porada-skip-${monday}`;

/**
 * The spec of the confirmed skip form; `monday` has no control, it only owns the stale message.
 * A skip also names the porada held next (`until`, ADR 0047).
 */
export function skipSpec(event: 'skip' | 'unskip', label: string): FormSpec {
  return {
    confirmed: { label: COPY[event].confirm, required: true, messages: { required: unconfirmed } },
    monday: { label: meeting(label), messages: { invalid: stale } },
    ...(event === 'skip' && {
      until: {
        label: porada.skip.until,
        required: true,
        messages: { invalid: porada.skip.untilInvalid },
      },
    }),
  };
}

/**
 * What the form sends: the version only for a slot with a row, `confirmed` only when ticked, and
 * `until` only for a skip whose form offered a porada to hold next.
 */
export function skipInput(
  monday: string,
  event: 'skip' | 'unskip',
  version: number | null,
  data: FormData,
): z.input<typeof setSkippedInput> {
  const until = event === 'skip' ? textOf(data, 'until') : '';
  return {
    monday,
    event,
    ...(version !== null && { expectedVersion: version }),
    ...(flagOf(data, 'confirmed') && { confirmed: true as const }),
    ...(until !== '' && { until }),
  };
}
