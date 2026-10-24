/** A page's query string as Next hands it over. */
export type SearchParams = Readonly<Record<string, string | string[] | undefined>>;

/** The first value of a query parameter; a repeated one counts once. */
export const first = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;
