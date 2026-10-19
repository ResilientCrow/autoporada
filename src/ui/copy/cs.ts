import type { ErrorCode, FieldIssueCode, RuleCode } from '@/contracts';

/**
 * Czech UI copy. Every user-facing string lives here so wording can be
 * reviewed in one place (formal "vy", Czech typography).
 */
export const cs = {
  app: {
    name: 'Autoporada',
    description: 'Podklady pro poradu vedení Smíchovské střední',
  },
  placeholder: {
    heading: 'Autoporada',
    body: 'Aplikace se připravuje.',
  },
  /** Why an action did not happen; `unavailable` is shown with the request id. */
  errors: {
    'invalid-input': 'Zkontrolujte prosím označená pole.',
    unauthenticated: 'Přihlášení vypršelo. Přihlaste se prosím znovu.',
    'step-up-required': 'Pro tuto změnu se prosím znovu přihlaste.',
    forbidden: 'K této akci nemáte oprávnění.',
    'not-found': 'Položka neexistuje, nebo k ní nemáte přístup.',
    conflict: 'Položku mezitím změnil někdo jiný. Načtěte prosím stránku znovu.',
    busy: 'Položka se právě zpracovává. Zkuste to prosím za chvíli znovu.',
    rule: 'Akci nelze provést.',
    'rate-limited': 'Příliš mnoho pokusů za krátkou dobu. Zkuste to prosím později.',
    unavailable: 'Něco se nepovedlo. Pokud potíže trvají, pošlete správci kód chyby.',
  } satisfies Record<ErrorCode, string>,
  rules: {
    'last-headmaster': 'Musí zůstat alespoň jeden aktivní účet ředitele.',
  } satisfies Record<RuleCode, string>,
  fieldIssues: {
    required: 'Vyplňte prosím toto pole.',
    'too-short': 'Text je příliš krátký.',
    'too-long': 'Text je příliš dlouhý.',
    invalid: 'Hodnota není platná.',
  } satisfies Record<FieldIssueCode, string>,
} as const;
