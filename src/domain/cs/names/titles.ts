/**
 * Academic and professional titles, written without the final dot. Shared by
 * name parsing (never declined) and typography (bound to the name by NBSP).
 */
export const TITLES_BEFORE: readonly string[] = [
  'Bc',
  'BcA',
  'Mgr',
  'MgA',
  'Ing',
  'arch',
  'MUDr',
  'MDDr',
  'MVDr',
  'PhDr',
  'RNDr',
  'PaedDr',
  'PharmDr',
  'JUDr',
  'ThDr',
  'ThLic',
  'ThMgr',
  'ICDr',
  'RSDr',
  'Dr',
  'MSc',
  'doc',
  'Doc',
  'prof',
  'Prof',
  'akad',
  'mal',
];

/** Written after the name, separated by a comma: „Ing. Petr Dvořák, Ph.D.“ */
const TITLES_AFTER: readonly string[] = [
  'Ph.D.',
  'CSc.',
  'DrSc.',
  'DiS.',
  'MBA',
  'LL.M.',
  'MSc.',
  'Th.D.',
];

const BEFORE = new Set(TITLES_BEFORE.map((t) => `${t}.`));
const AFTER = new Set(TITLES_AFTER);

export const isTitleBefore = (word: string) => BEFORE.has(word);
export const isTitleAfter = (word: string) => AFTER.has(word.replace(/,$/, ''));
