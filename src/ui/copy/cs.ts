import type { ErrorCode, FieldIssueCode, RuleCode, SignInError } from '@/contracts';

/**
 * Czech UI copy. Every user-facing string lives here so wording can be
 * reviewed in one place (formal "vy", Czech typography).
 */
export const cs = {
  app: {
    name: 'Autoporada',
    description: 'Podklady pro poradu vedení Smíchovské střední',
  },
  signIn: {
    title: 'Přihlášení',
    intro: 'Přihlaste se svým školním účtem Microsoft 365.',
    button: 'Přihlásit se účtem Microsoft 365',
    switchAccount: 'Přihlásit se jiným účtem',
    code: 'Kód chyby:',
    errors: {
      expired: 'Přihlášení vypršelo nebo už bylo použito. Přihlaste se prosím znovu.',
      cancelled: 'Přihlášení bylo zrušeno.',
      'not-member':
        'Přihlásit se lze jen školním účtem Microsoft 365. Účty hostů a jiných organizací povoleny nejsou.',
      blocked: 'Váš účet je v Autoporadě zablokovaný. Obraťte se prosím na vedení školy.',
      'step-up-mismatch': 'Ověřte se prosím stejným účtem, kterým jste přihlášeni.',
      'step-up-stale': 'Ověření se nepodařilo dokončit. Při přihlášení prosím znovu zadejte heslo.',
      failed:
        'Přihlášení se nepodařilo. Zkuste to prosím znovu; pokud potíže trvají, pošlete správci kód chyby.',
      unavailable: 'Přihlašovací služba Microsoft teď neodpovídá. Zkuste to prosím za chvíli.',
    } satisfies Record<SignInError, string>,
    loggedOut: {
      here: 'Byli jste odhlášeni.',
      everywhere: 'Byli jste odhlášeni na všech zařízeních.',
      sharedComputer: 'Na sdíleném počítači se odhlaste i z Microsoft 365.',
    },
  },
  home: {
    signedInAs: 'Přihlášen(a):',
    pending: 'Váš účet čeká na schválení vedením školy.',
    signOut: 'Odhlásit se',
    signOutEverywhere: 'Odhlásit všude',
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
