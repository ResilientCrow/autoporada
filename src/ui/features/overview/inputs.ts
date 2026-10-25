import type { z } from 'zod';

import type { setSkippedInput } from '@/contracts';
import { issues } from '@/ui/copy';
import { flagOf, type FormSpec } from '@/ui/form';

/** The id of a Monday's form. */
export const formId = (monday: string): string => `porada-${monday}`;

/**
 * The id of a Monday's date heading. It is also the id the form gives its
 * `monday` field, so the error summary of a stale Monday links to the heading.
 */
export const dateId = (monday: string): string => `${formId(monday)}-monday`;

const { skip, unskip, unconfirmed, meeting, stale } = issues.strip;
const COPY = { skip, unskip } as const;

/**
 * The spec of one Monday's form. `monday` has no control: it names the heading
 * and gives a Monday whose deadline has passed (`invalid`) its own message.
 */
export function skipSpec(event: 'skip' | 'unskip', label: string): FormSpec {
  return {
    confirmed: { label: COPY[event].confirm, required: true, messages: { required: unconfirmed } },
    monday: { label: meeting(label), messages: { invalid: stale } },
  };
}

/**
 * What „Porada se nekoná“ and „Porada se koná“ send. `expectedVersion` is there
 * only for a Monday that has a row, and `confirmed` only when the box is
 * ticked, so the server, not the form, refuses an unticked one.
 */
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
