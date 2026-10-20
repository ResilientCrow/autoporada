import type { ErrorCode, FieldIssueCode, RuleCode } from '@/contracts';

/** Why an action did not happen; `unavailable` is shown with the request id. */
export const errors = {
  'invalid-input': 'Zkontrolujte prosím označená pole.',
  unauthenticated: 'Přihlášení vypršelo. Přihlaste se prosím znovu.',
  'step-up-required': 'Pro tuto změnu se prosím znovu přihlaste.',
  forbidden: 'K\u00A0této akci nemáte oprávnění.',
  'not-found': 'Položka neexistuje, nebo k\u00A0ní nemáte přístup.',
  conflict: 'Položku mezitím změnil někdo jiný. Načtěte prosím stránku znovu.',
  busy: 'Položka se právě zpracovává. Zkuste to prosím za chvíli znovu.',
  rule: 'Akci nelze provést.',
  'rate-limited': 'Příliš mnoho pokusů za krátkou dobu. Zkuste to prosím později.',
  unavailable: 'Něco se nepovedlo. Pokud potíže trvají, pošlete správci kód chyby.',
} as const satisfies Record<ErrorCode, string>;

export const rules = {
  'last-headmaster': 'Musí zůstat alespoň jeden aktivní účet ředitele.',
} as const satisfies Record<RuleCode, string>;

export const fieldIssues = {
  required: 'Vyplňte prosím toto pole.',
  'too-short': 'Text je příliš krátký.',
  'too-long': 'Text je příliš dlouhý.',
  invalid: 'Hodnota není platná.',
} as const satisfies Record<FieldIssueCode, string>;

/** Chrome of the form components: optional marker, error prefix, summary title. */
export const form = {
  optional: '(nepovinné)',
  errorPrefix: 'Chyba:',
  summaryTitle: 'Zkontrolujte prosím tyto údaje',
} as const;
