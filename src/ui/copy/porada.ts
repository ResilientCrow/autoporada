import { countWord, type PluralForms } from '@/domain/cs';

const POINT: PluralForms = { one: 'bod', few: 'body', many: 'bodů' };
const DRAFT: PluralForms = { one: 'zpráva', few: 'zprávy', many: 'zpráv' };
const NAME: PluralForms = { one: 'jméno', few: 'jména', many: 'jmen' };

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
    failed: 'PDF se nepodařilo vytvořit. Stáhněte DOCX a\u00a0uložte ho jako PDF ve Wordu.',
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
  skip: {
    title: 'Porada se nekoná',
    /** `next` arrives written, „10. 11. 2026“. */
    afterDeadline: (next: string) =>
      `Uzávěrka už proběhla; schválené body se přesunou na poradu ${next}.`,
    noNext: 'Uzávěrka už proběhla a\u00a0po této poradě žádná další není v\u00a0kalendáři.',
    kept: (next: string) => `Body odevzdané během zrušení zůstávají na poradě ${next}.`,
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
