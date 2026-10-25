const NBSP = '\u00A0';

export interface PluralForms {
  /** 1: „osoba“. */
  readonly one: string;
  /** 2 to 4: „osoby“. */
  readonly few: string;
  /** 0 and 5 or more: „osob“. */
  readonly many: string;
}

/**
 * „1 osoba“, „3 osoby“, „5 osob“, „22 osob“: the count, a no-break space and
 * its form. Czech has no mod-10 rule, so 21 to 24 take many (CLDR's other).
 * Counts are whole and non-negative; anything else is a caller bug and
 * throws, like a reversed date range.
 */
export function countWord(n: number, forms: PluralForms): string {
  if (!Number.isSafeInteger(n) || n < 0) throw new RangeError('A count is a whole number');
  const form = n === 1 ? forms.one : n >= 2 && n <= 4 ? forms.few : forms.many;
  return `${n}${NBSP}${form}`;
}
