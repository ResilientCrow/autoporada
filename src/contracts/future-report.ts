import { z } from 'zod';

import { version } from './future';

/**
 * „Napsat zprávu“ on an akce whose last day has passed (design section 12): the report of the
 * chosen type, prefilled from the akce. No version: the list the button sits on has none, and
 * a second press gives the same draft.
 */
export const startFutureReportInput = z.strictObject({ id: z.uuid(), typeId: z.uuid() });
export const startFutureReportOutput = z.object({ pointId: z.uuid() });

/** „Zprávu psát nebudu“: no report will follow the akce. */
export const declineFutureReportInput = z.strictObject({ id: z.uuid() });
export const declineFutureReportOutput = z.object({ version });
