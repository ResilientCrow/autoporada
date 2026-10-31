import type { ErrorCode, FieldIssueCode, RuleCode } from '@/contracts';
import { STEP_UP_MAX_AGE_MS } from '@/domain/policy';
import { DRAFT_CAP } from '@/domain/report';
import { ACCESS_COOLDOWN_DAYS } from '@/domain/review';

/** Why an action did not happen; `invalid-input` here is the case with no field to point at. */
export const errors = {
  'invalid-input': 'Zadání obsahuje znaky, které nelze uložit. Zkontrolujte prosím text.',
  unauthenticated: 'Přihlášení vypršelo. Přihlaste se prosím znovu.',
  'step-up-required': 'Pro tuto změnu se prosím znovu přihlaste.',
  forbidden: 'K\u00A0této akci nemáte oprávnění.',
  'not-found': 'Položka neexistuje, nebo k\u00A0ní nemáte přístup.',
  conflict: 'Stav se mezitím změnil. Načtěte prosím aktuální stav a\u00A0akci případně zopakujte.',
  busy: 'Položka se právě zpracovává. Zkuste to prosím za chvíli znovu.',
  rule: 'Akci nelze provést.',
  'rate-limited': 'Příliš mnoho pokusů za krátkou dobu.',
  unavailable: 'Něco se nepovedlo. Pokud potíže trvají, pošlete správci kód chyby.',
  network:
    'Nepodařilo se spojit se serverem. Zkontrolujte připojení; pokud to nepomůže, načtěte stránku znovu.',
} as const satisfies Record<ErrorCode | 'network', string>;

/** The actions and hints a problem notice adds to its text. */
export const problemActions = {
  retry: 'Znovu to můžete zkusit',
  signIn: 'Přihlásit se (otevře se na nové kartě)',
  stepUp: 'Potvrdit totožnost (otevře se na nové kartě)',
  reload: 'Načíst aktuální stav',
  returnHint:
    'Po přihlášení se vraťte na tuto kartu a\u00A0odešlete formulář znovu. Napsaný text zůstane zachován.',
} as const;

export const rules = {
  'last-headmaster': 'Musí zůstat alespoň jeden aktivní účet ředitele.',
  'student-role': 'Student může mít jen roli přispěvatele.',
  'request-pending': 'Žádost už čeká na rozhodnutí vedení školy.',
  'request-cooldown': `Novou žádost lze podat nejdříve ${ACCESS_COOLDOWN_DAYS}\u00A0dní po zamítnutí.`,
  'request-blocked': 'Další žádosti o\u00A0přístup nelze podat. Obraťte se prosím na vedení školy.',
  'draft-cap': `Rozpracovaných bodů můžete mít nejvýše ${DRAFT_CAP}. Dokončete nebo zrušte některé z\u00A0nich.`,
  'point-not-editable': 'Bod už nelze upravovat, protože se změnil jeho stav.',
  'future-not-editable': 'Položku už nelze upravovat, protože se změnil její stav.',
  'report-not-due': 'Zprávu k\u00A0této akci teď nelze založit.',
  'type-name-taken': 'Typ bodu s\u00A0tímto názvem už existuje.',
  'type-locked': 'Tento typ nelze vypnout.',
  'bullet-kind-fixed': 'Druh uložené odrážky nelze změnit. Odeberte ji a\u00A0přidejte novou.',
  'registry-duplicate': 'Student se stejným jménem a\u00A0třídou už na seznamu je.',
  'registry-list-taken': 'Seznam s\u00A0tímto názvem už existuje.',
  'registry-list-fixed': 'Seznam pro Přílohu\u00A01 nelze vypnout.',
  'quotes-not-allowed': 'Vyjádření lze přidat jen k\u00A0bodu o\u00A0partnerech.',
  'quotes-full': 'K\u00A0bodu lze přidat nejvýš 20\u00A0vyjádření.',
  'item-missing': 'Tento bod už v\u00A0pokynech není. Načtěte stránku znovu.',
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
  noscript: 'Odeslání formuláře vyžaduje zapnutý JavaScript.',
} as const;

/** The notice before a form that needs a fresh sign-in (a step-up action). */
export const stepUpNotice = {
  title: 'Potvrďte svou totožnost',
  text: `Před změnou role nebo stavu účtu se prosím znovu přihlaste. Ověření platí ${STEP_UP_MAX_AGE_MS / 60_000}\u00A0minut.`,
  action: 'Potvrdit totožnost',
} as const;
