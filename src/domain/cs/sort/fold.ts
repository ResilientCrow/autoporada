/** Diacritics and case removed, so „novak“ finds „Nováková“. „ch“ stays two letters. */
export function foldForSearch(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('cs');
}

/** Words of folded text: spaces, hyphens and brackets all separate, as in Graph's tokenizer. */
export function searchWords(text: string): string[] {
  return foldForSearch(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/** The rule of Graph's `$search`: every wanted word starts some word of the name. Both are folded words. */
export function matchesWordPrefixes(wanted: readonly string[], words: readonly string[]): boolean {
  return wanted.every((w) => words.some((word) => word.startsWith(w)));
}
