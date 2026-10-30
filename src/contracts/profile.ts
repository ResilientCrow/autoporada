import { z } from 'zod';

/** „Posílat mi připomínky uzávěrky“: the full desired state, so a repeat is harmless. */
export const setRemindersInput = z.strictObject({ on: z.boolean() });
export const setRemindersOutput = z.object({ changed: z.boolean() });
