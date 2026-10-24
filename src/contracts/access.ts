import { z } from 'zod';

import { ACCESS_REASON_MAX } from '@/domain/review';

/** Why the person needs access, in their own words; only the headmaster reads it. */
export const requestAccessInput = z.strictObject({
  reason: z.string().trim().min(1).max(ACCESS_REASON_MAX),
});
export const requestAccessOutput = z.object({ requestId: z.guid() });
