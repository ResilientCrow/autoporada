import { z } from 'zod';

/**
 * Where a page of a list ended, as `{ms}.{id}`: text a query parameter carries as it is. The
 * instant is the row's change at millisecond precision (a JS Date; the columns a cursor pages
 * by keep no more), the id breaks a tie.
 */
const CURSOR = /^(\d{1,15})\.([0-9a-f-]{36})$/;
export const CURSOR_MAX = 52;

export const cursorText = ({ updatedAt, id }: { readonly updatedAt: Date; readonly id: string }) =>
  `${updatedAt.getTime()}.${id}`;

export const cursorSchema = z
  .string()
  .max(CURSOR_MAX)
  .transform((text, ctx) => {
    const [, ms, id] = CURSOR.exec(text) ?? [];
    if (ms === undefined || id === undefined || !z.uuid().safeParse(id).success) {
      ctx.addIssue({ code: 'custom', message: 'invalid' });
      return z.NEVER;
    }
    return { updatedAt: new Date(Number(ms)), id };
  });
