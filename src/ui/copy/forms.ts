import type { ErrorCode, FieldIssueCode, RuleCode } from '@/contracts';
import { STEP_UP_MAX_AGE_MS } from '@/domain/policy';
import { DRAFT_CAP, FUTURE_CAP, PENDING_CAP } from '@/domain/report';
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
  /** The lead of an `unavailable` failure: a failure always rolls back (ADR 0011); `failures` says why. */
  unavailable: 'Změny se neuložily.',
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
  'pending-cap': `U\u00A0vedení můžete mít najednou nejvýše ${PENDING_CAP} bodů. Počkejte, až některé z\u00A0nich zkontroluje.`,
  'future-draft-cap': `Rozepsaných akcí a\u00A0jednání můžete mít nejvýše ${FUTURE_CAP}. Dokončete nebo smažte některé z\u00A0nich.`,
  'future-pending-cap': `U\u00A0vedení můžete mít najednou nejvýše ${FUTURE_CAP} akcí a\u00A0jednání. Počkejte, až některé z\u00A0nich zkontroluje.`,
  'point-not-editable': 'Bod už nelze upravovat, protože se změnil jeho stav.',
  'future-not-editable': 'Položku už nelze upravovat, protože se změnil její stav.',
  'report-not-due': 'Zprávu k\u00A0této akci teď nelze založit.',
  'registry-duplicate': 'Student se stejným jménem a\u00A0třídou už na seznamu je.',
  'registry-list-taken': 'Seznam s\u00A0tímto názvem už existuje.',
  'registry-list-fixed': 'Seznam pro Přílohu\u00A01 nelze vypnout.',
  'quotes-not-allowed': 'Vyjádření lze přidat jen k\u00A0bodu o\u00A0partnerech.',
  'quotes-full': 'K\u00A0bodu lze přidat nejvýš 20\u00A0vyjádření.',
  'item-missing': 'Tento bod už v\u00A0pokynech není. Načtěte stránku znovu.',
  'slot-fixed': 'Tento bod vytváří dokument sám. Nelze ho odebrat ani změnit na jednorázový.',
  'proposal-fixed': 'Text schváleného návrhu upravíte v\u00A0kontrole. Zde ho lze jen přesunout.',
  'outline-full': 'V\u00A0jedné části může být nejvýš 60\u00A0bodů.',
  'meeting-order':
    'Porady musí následovat v\u00A0pořadí kalendáře a\u00A0jejich uzávěrky také. Tato změna by pořadí porušila.',
  'later-generated':
    'Tuto poradu už nelze obnovit, protože pozdější porada je vygenerovaná. Porady se generují v\u00A0pořadí kalendáře.',
  'issue-not-open': 'Tuto poradu už nelze změnit, protože se její stav změnil.',
  'issue-blocked': 'Dokument zatím nelze vygenerovat. Náhled ukazuje, co je potřeba opravit.',
  'deadline-past': 'Uzávěrka by k\u00A0tomu dni už proběhla. Zvolte pozdější den.',
  'porada-exists': 'V\u00A0tom týdnu už porada je. Přesuňte ji, nebo zvolte jiný týden.',
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
