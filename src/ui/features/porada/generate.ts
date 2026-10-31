import type { z } from 'zod';

import type { generateIssueInput } from '@/contracts';
import { issues, porada } from '@/ui/copy';
import { flagOf, type FormSpec } from '@/ui/form';

/** The spec of the generate form; `monday` has no control, it only owns the stale message. */
export const generateSpec: FormSpec = {
  confirmed: {
    label: porada.generate.confirm,
    required: true,
    messages: { required: porada.generate.unconfirmed },
  },
  monday: { label: porada.generate.title, messages: { invalid: issues.strip.stale } },
};

/** What the form sends: the version the preview showed, `confirmed` only when ticked. */
export function generateInput(
  monday: string,
  version: number | null,
  data: FormData,
): z.input<typeof generateIssueInput> {
  return {
    monday,
    ...(version !== null && { expectedVersion: version }),
    ...(flagOf(data, 'confirmed') && { confirmed: true as const }),
  };
}
