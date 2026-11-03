import type { PdfFailure } from '@/contracts';
import { countWord, type PluralForms } from '@/domain/cs';
import type { PointState } from '@/domain/review';

const POINT: PluralForms = { one: 'bod', few: 'body', many: 'bodů' };
const DRAFT: PluralForms = { one: 'zpráva', few: 'zprávy', many: 'zpráv' };
const NAME: PluralForms = { one: 'jméno', few: 'jména', many: 'jmen' };

/** Why a PDF could not be made (ADR 0044); one sentence per reason, and a failure from before the reason is `error`. */
const PDF_FAILED = {
  timeout: 'Převod do\u00a0PDF trval příliš dlouho.',
  unavailable: 'Převodník PDF neběží nebo je nedostupný.',
  refused: 'Převodník PDF dokument odmítl. Dejte to prosím vědět správci.',
  'not-pdf': 'Převodník PDF nevrátil platné PDF. Dejte to prosím vědět správci.',
  'too-large': 'PDF by bylo příliš velké.',
  error: 'Převod do\u00a0PDF selhal. Dejte to prosím vědět správci.',
} as const satisfies Record<PdfFailure, string>;

/** „Porada“: where the headmaster prepares the weekly meeting and its document. */
export const porada = {
  title: 'Porada',
  none: {
    title: 'Žádná porada k\u00a0přípravě',
    text: 'V\u00a0kalendáři teď není žádná porada, kterou by bylo třeba připravit.',
  },
  /** `meeting` arrives written, „pondělí 9. listopadu 2026“. */
  meeting: (meeting: string) => `Porada se koná ${meeting}`,
  /** `monday` arrives written, „2.\u00a011.“. */
  moved: (monday: string) => `Přesunuto z\u00a0pondělí ${monday}`,
  /** The Přehled line of a moved porada; `meeting` is „9. 11. 2026“. */
  heldOn: (meeting: string, closes: { weekday: string; date: string; time: string }) =>
    `Porada se koná ${meeting}, uzávěrka ${closes.weekday} ${closes.date} v\u00a0${closes.time}.`,
  move: {
    title: 'Přesunout poradu',
    open: 'Přesunout poradu',
    back: 'Zpět na poradu',
    /** `meeting` arrives written, „9. 11. 2026“. */
    current: (meeting: string) => `Porada se teď koná ${meeting}.`,
    fields: {
      meetingDate: 'Nové datum porady',
      deadlineDate: 'Uzávěrka: den',
      deadlineTime: 'Uzávěrka: čas',
      confirmed: 'Rozumím, že se tyto porady zruší.',
      stale: 'Porada se mezitím změnila. Načtěte stránku znovu.',
      skip: 'Porady v\u00a0cestě se změnily. Zkontrolujte je prosím.',
    },
    submit: 'Přesunout poradu',
    said: (meeting: string) => `Porada je přesunuta na ${meeting}.`,
    /** `when` arrives written, „sobota 7. 11. v 20:00“. */
    effectEarlier: (when: string) => `Uzávěrka bude dřív (${when}).`,
    effectLater: (when: string) =>
      `Uzávěrka bude později (${when}). Body odevzdané do té doby půjdou na tuto poradu.`,
    /** `list` arrives written, „9. 11. 2026, 16. 11. 2026“. */
    conflicts: (list: string) => `Porady v\u00a0cestě se zruší: ${list}.`,
    conflictsFixed: 'V\u00a0cestě je porada, která už je vygenerovaná. Zvolte jiné datum.',
    deadlinePast: 'Uzávěrka podle pravidla už proběhla. Zadejte ji ručně.',
  },
  deadline: {
    ahead: (weekday: string, date: string, time: string) =>
      `Uzávěrka: ${weekday} ${date} v\u00a0${time}`,
    passed: (weekday: string, date: string, time: string) =>
      `Uzávěrka proběhla: ${weekday} ${date} v\u00a0${time}`,
  },
  counts: {
    title: 'Co čeká na tuto poradu',
    waiting: (n: number) => `Ke kontrole: ${countWord(n, POINT)}`,
    returned: (n: number) => `Vráceno autorům: ${countWord(n, POINT)}`,
    approved: (n: number) => `Schváleno: ${countWord(n, POINT)}`,
    later: (n: number) => `Zprávy čekající na konec akce: ${n}`,
  },
  steps: {
    title: 'Příprava dokumentu',
    details: 'Údaje',
    outline: 'Pokyny a\u00a0hospodaření',
    annex2: 'Příloha\u00a02',
    missing: 'Chybějící zprávy',
    preview: 'Náhled',
  },
  generate: {
    title: 'Vygenerovat dokument',
    intro:
      'Vygenerováním se dokument uloží, schválené body se zveřejní a\u00a0poradu už nepůjde upravit.',
    blocked: 'Dokument zatím nelze vygenerovat. Nejdřív opravte, co výše brání vygenerování.',
    confirm: 'Rozumím, že vygenerovanou poradu už nelze změnit.',
    unconfirmed: 'Potvrďte prosím vygenerování.',
    submit: 'Vygenerovat dokument',
    /** On the workspace of an open porada: the button is on the preview. */
    where: 'Dokument vygenerujete v\u00a0náhledu, až ho zkontrolujete.',
    open: 'Zkontrolovat a\u00a0vygenerovat',
  },
  /** The generated document of a porada (ADR 0038). */
  document: {
    title: 'Dokument',
    /** `date` and `time` arrive written, „31. 10. 2026“ and „14:05“. */
    at: (date: string, time: string) => `Vygenerováno ${date} v\u00a0${time}.`,
    docx: 'Stáhnout DOCX',
    pdf: 'Stáhnout PDF',
    pending: 'PDF se ještě připravuje. Načtěte stránku za chvíli.',
    /** Why the PDF could not be made (ADR 0044); `fallback` follows. A failure from before the reason is `error`. */
    failed: PDF_FAILED,
    fallback: 'Stáhněte DOCX a\u00a0uložte ho jako PDF ve Wordu.',
  },
  /** A download that gave no file; `failures` adds the reason (ADR 0044). */
  download: {
    failed: 'Dokument se nepodařilo stáhnout.',
    'not-found': 'Dokument neexistuje, nebo k\u00a0němu nemáte přístup.',
  },
  archive: {
    title: 'Archiv porad',
    open: 'Archiv porad',
    empty: 'Zatím není vygenerovaná žádná porada.',
    /** `meeting` arrives written, „pondělí 9. listopadu 2026“. */
    meeting: (meeting: string) => `Porada ${meeting}`,
  },
  /** The dialogs of the status card that skip a porada and bring it back (ADR 0047). */
  skip: {
    title: 'Porada se nekoná',
    unskipTitle: 'Porada se koná',
    /** `meeting` arrives written, „pondělí 9. listopadu 2026“. */
    lead: (meeting: string) => `Porada ${meeting} se nekoná.`,
    until: 'Další porada se koná',
    untilHint: 'Porady před tímto datem se také nekonají.',
    untilInvalid: 'Tuto poradu už nelze vybrat. Načtěte prosím stránku.',
    afterDeadline: 'Uzávěrka už proběhla; schválené body se přesunou na vybranou poradu.',
    noNext: 'Po této poradě žádná další není v\u00a0kalendáři.',
    /** `next` arrives written, „10. 11. 2026“. */
    kept: (next: string) => `Body odevzdané během zrušení zůstávají na poradě ${next}.`,
    cancel: 'Zrušit',
    /** What the status line says after a skip; `next` arrives as the select wrote it. */
    said: (label: string, next: string) => `Porada ${label} se nekoná. Další porada: ${next}.`,
  },
  /** „Pokyny a hospodaření“: the items of the two sections (/porada/[datum]/pokyny). */
  outline: {
    title: 'Pokyny a\u00a0hospodaření',
    back: 'Zpět na přípravu porady',
    sections: { pokyny: 'Pokyny', hospodareni: 'Hospodaření' },
    empty: 'V\u00a0této části zatím nic není.',
    slot: 'Pevný bod',
    persistence: {
      standing: 'Stálý bod (přejde do další porady)',
      once: 'Jen pro tuto poradu',
    },
    chip: { standing: 'Stálý', once: 'Jen tato porada' },
    proposal: {
      new: 'Nově schválený návrh – zařazen na konec',
      placed: 'Schválený návrh',
      edit: 'Text návrhu upravíte v\u00a0kontrole.',
      open: 'Otevřít v\u00a0kontrole',
    },
    edit: 'Upravit',
    remove: 'Odebrat',
    move: {
      up: 'Nahoru',
      down: 'Dolů',
      label: (title: string) => `Pořadí bodu ${title}`,
    },
    said: {
      added: 'Bod je přidán na konec.',
      moved: 'Pořadí je změněno.',
      removed: 'Bod je odebrán.',
    },
    add: {
      title: 'Přidat bod',
      name: 'Název bodu',
      persistence: 'Platnost bodu',
      submit: 'Přidat bod',
      withText: 'Přidat bod i\u00a0s\u00a0textem',
    },
    fields: { stale: 'Porada se mezitím změnila. Načtěte stránku znovu.' },
    /** The item editor (/porada/[datum]/pokyny/nova and /[polozka]). */
    editor: {
      newTitle: 'Nový bod',
      editTitle: 'Upravit bod',
      name: 'Název bodu',
      persistence: 'Platnost bodu',
      body: 'Text bodu',
      save: 'Uložit',
      add: 'Přidat bod',
      saved: 'Bod je uložen.',
      back: 'Zpět na Pokyny a\u00a0hospodaření',
      generated: 'Tento bod sestavuje dokument sám z\u00a0kalendáře. Není co upravovat.',
      previewLabel: 'Náhled bodu',
      previewEmpty: 'Bod se v\u00a0dokumentu ukáže, jakmile bude mít název a\u00a0text.',
      quotes: {
        title: 'Vyjádření partnerů',
        none: 'Zatím žádné vyjádření.',
        add: 'Přidat vyjádření',
        remove: (n: number) => `Odebrat vyjádření ${n}`,
        group: (n: number) => `Vyjádření ${n}`,
        speaker: (n: number) => `Řečník ve 2. pádě (vyjádření ${n})`,
        speakerHint: 'Například „pana Jana Nováka“.',
        affiliation: (n: number) => `Třída nebo funkce (vyjádření ${n})`,
        quote: (n: number) => `Text vyjádření ${n}`,
      },
    },
  },
  /** „Údaje“: Přítomni and Hosté (/porada/[datum]/udaje). */
  details: {
    title: 'Údaje',
    back: 'Zpět na přípravu porady',
    present: 'Přítomni',
    guests: 'Hosté',
    save: 'Uložit',
    saved: 'Údaje jsou uloženy.',
    carried: 'Údaje jsou převzaté z\u00a0minulé porady. Uloží se při prvním uložení.',
    stale: 'Porada se mezitím změnila. Načtěte stránku znovu.',
  },
  /** „Příloha 2“: its text (/porada/[datum]/priloha-2). */
  annex2: {
    title: 'Příloha\u00a02',
    back: 'Zpět na přípravu porady',
    body: 'Text přílohy',
    save: 'Uložit',
    saved: 'Příloha je uložena.',
    remove: 'Odebrat přílohu',
    removed: 'Příloha je odebrána. Dokument bude bez Přílohy\u00a02.',
    none: 'Porada nemá Přílohu\u00a02.',
    carried: 'Text je převzatý z\u00a0minulé porady. Uloží se při prvním uložení.',
    stale: 'Porada se mezitím změnila. Načtěte stránku znovu.',
  },
  /** „Chybějící zprávy“: the paragraph printed for an akce without an approved report (/porada/[datum]/zpravy, ADR 0049). */
  missing: {
    title: 'Chybějící zprávy',
    /** The headmaster's card on Přehled (ADR 0052); `porada` arrives written, „10.\u00a011.“. */
    tally: (porada: string, missing: number, owed: number) =>
      `Zprávy z\u00a0akcí pro poradu ${porada}: neodevzdáno ${missing} z\u00a0${owed}`,
    /** The step's link on the porada page when akce lack a report; `count` is above zero. */
    step: (count: number) => `Chybějící zprávy (${count})`,
    back: 'Zpět na přípravu porady',
    intro:
      'U\u00a0těchto akcí nemá porada schválenou zprávu. Při vygenerování dokument vytiskne místo ní odstavec níže a\u00a0dvě pevné věty pod ním. Zprávu schválenou před vygenerováním dokument vytiskne celou a\u00a0tento odstavec nepoužije.',
    empty: 'Žádné zprávy nechybí.',
    closed:
      'Porada se nekoná nebo už je vygenerovaná. Chybějící zprávy v\u00a0ní už nejde upravit.',
    /** `dates` arrives written, „5.–6. 11. 2026“. */
    when: (dates: string) => `Konání: ${dates}`,
    state: {
      none: 'Zpráva nebyla založena',
      draft: 'Zpráva je rozepsaná',
      submitted: 'Zpráva čeká na kontrolu',
      returned: 'Zpráva je vrácená autorovi',
      approved: 'Zpráva je schválená',
      rejected: 'Zpráva je zamítnutá',
      withdrawn: 'Zpráva je stažená',
      published: 'Zpráva je zařazená do porady',
    } as const satisfies Record<'none' | PointState, string>,
    paragraph: 'Odstavec v\u00a0dokumentu',
    own: 'Odstavec jste upravili vy.',
    original: 'Odstavec napsal systém.',
    fixed: 'Pod odstavcem dokument vždy vytiskne:',
    save: 'Uložit',
    saved: 'Odstavec je uložen.',
    reset: 'Obnovit původní text',
    resetDone: 'Je zpět původní odstavec.',
    stale: 'Porada nebo odstavec se mezitím změnily. Načtěte stránku znovu.',
  },
  origin: {
    /** `meeting` arrives written, „9. 11. 2026“. */
    derived: (meeting: string) =>
      `Obsah převzatý z\u00a0porady ${meeting}. Uloží se při první změně.`,
    seed: 'Výchozí obsah ze šablony. Uloží se při první změně.',
  },
  preview: {
    title: 'Náhled',
    back: 'Zpět na přípravu porady',
    paper: 'Náhled dokumentu',
    invalid: 'Dokument teď nelze sestavit. Příčiny jsou v\u00a0seznamu výše.',
  },
  preflight: {
    title: 'Před vygenerováním',
    none: 'Nic nebrání vygenerování a\u00a0nic nestojí za kontrolu.',
    level: {
      block: 'Brání vygenerování',
      warn: 'Stojí za kontrolu',
      info: 'Pro informaci',
    },
    code: {
      'issue-not-open': 'Porada se nekoná nebo už je vygenerovaná.',
      'earlier-open':
        'Dřívější porada ještě není vygenerovaná ani zrušená. Nejdřív ji vygenerujte, nebo u\u00a0ní zvolte „Porada se nekoná“:',
      'snapshot-invalid': 'Údaje nesplňují požadavky šablony. Chybí nebo nesedí:',
      'report-incomplete': 'Zpráva je neúplná a\u00a0v\u00a0dokumentu chybí:',
      'points-waiting': 'Body čekají na kontrolu a\u00a0v\u00a0dokumentu zatím nejsou:',
      'points-returned': 'Body jsou vrácené autorům a\u00a0v\u00a0dokumentu zatím nejsou:',
      'akce-waiting': 'Akce čekají na kontrolu a\u00a0v\u00a0dokumentu zatím nejsou:',
      'late-reports-expected':
        'Zprávy z\u00a0již skončených akcí se ještě mohou odevzdat po uzávěrce a\u00a0v\u00a0dokumentu zatím nejsou:',
      'reports-missing':
        'Zprávy z\u00a0těchto akcí nejsou schválené. V\u00a0dokumentu bude místo nich jen věta o\u00a0akci a\u00a0poznámka, že zpráva nebyla dodána. Po vygenerování už se zpráva odevzdat nedá:',
      'proposal-dropped':
        'Návrhy zařazené v\u00a0pokynech už nejsou schválené, a\u00a0proto se z\u00a0dokumentu vynechaly:',
      'deadline-ahead': 'Uzávěrka ještě neproběhla, body mohou ještě přibýt.',
      'source-not-generated':
        'Pokyny se převzaly z\u00a0porady, která se nevygenerovala ani neodpadla. Jednorázové body a\u00a0ohlasy se do nich nepřenesly.',
      'annex1-empty': 'Seznam pro Přílohu\u00a01 je prázdný.',
      'reports-later': 'Tyto zprávy čekají na konec akce a\u00a0do dokumentu zatím nejdou:',
      'ohlasy-empty':
        'Ohlasy v\u00a0médiích i\u00a0partneři jsou prázdní, v\u00a0dokumentu nebudou.',
      'meeting-moved': 'Porada se nekoná v\u00a0pondělí, ale v\u00a0jiný den.',
    },
    /** `earlier-open`: the link to that porada; `meeting` arrives written, „19. 10. 2026“. */
    earlier: (meeting: string) => `Porada ${meeting}`,
    /** `late-reports-expected`: when the report closes, after the title. */
    due: (when: string) => ` (do\u00a0${when})`,
    /** `late-reports-expected`: drafts of other authors the headmaster may not read, only counted. */
    hiddenDrafts: (n: number) =>
      `Rozepsané zprávy bez akce, které nevidíte: ${countWord(n, DRAFT)}.`,
    /** `registry-new`: how many entries the document marks NOVÉ. */
    newEntries: (n: number) => `Označeno NOVÉ bude ${countWord(n, NAME)}.`,
  },
} as const;
