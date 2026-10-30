/** char_length counts code points, as `[...text]` does. */
export const codePoints = (text: string) => [...text].length;

/** Events are listed newest first, ties to the higher id, compared as PostgreSQL compares uuids. */
export const newestFirst = (
  a: { readonly createdAt: Date; readonly id: string },
  b: { readonly createdAt: Date; readonly id: string },
) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1);
