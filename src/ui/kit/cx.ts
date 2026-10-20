/** Joins class names, skipping the falsy ones. */
export function cx(...names: readonly (string | false | null | undefined)[]): string {
  return names.filter(Boolean).join(' ');
}
