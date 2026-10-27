/**
 * The React key of a point's editor (ADR 0017 item 2). Saves keep it while the author
 * types, since the editor holds the newer version itself; „Načíst aktuální stav“
 * loads a newer one, the key changes and the editor starts again from the server's values.
 */
export const editorKey = ({ id, version }: { readonly id: string; readonly version: number }) =>
  `${id}:${version}`;
