/** Diacritics and case removed, so „novak“ finds „Nováková“. „ch“ stays two letters. */
export function foldForSearch(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('cs');
}
