import { z } from 'zod';

/**
 * „Napsat zprávu“ on an akce whose last day has passed (design section 12): the report of the
 * chosen type, prefilled from the akce. No version: the list the button sits on has none, and
 * a second press gives the same draft. Nobody can decline it (ADR 0048).
 */
export const startFutureReportInput = z.strictObject({ id: z.uuid(), typeId: z.uuid() });
export const startFutureReportOutput = z.object({ pointId: z.uuid() });
