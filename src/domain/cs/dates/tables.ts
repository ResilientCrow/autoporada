// Own tables instead of Intl date formatting: output must be byte-stable
// across ICU versions, because it lands in archived official documents.

/** Indexed by ISO weekday - 1 (Monday first). */
export const WEEKDAY_NOMINATIVE = [
  'pondělí',
  'úterý',
  'středa',
  'čtvrtek',
  'pátek',
  'sobota',
  'neděle',
] as const;

/** „v pondělí“, „ve středu“ … — the accusative used after v/ve. */
export const WEEKDAY_ACCUSATIVE = [
  'pondělí',
  'úterý',
  'středu',
  'čtvrtek',
  'pátek',
  'sobotu',
  'neděli',
] as const;

/** „12. října“ — month names in the genitive, indexed by month - 1. */
export const MONTH_GENITIVE = [
  'ledna',
  'února',
  'března',
  'dubna',
  'května',
  'června',
  'července',
  'srpna',
  'září',
  'října',
  'listopadu',
  'prosince',
] as const;
