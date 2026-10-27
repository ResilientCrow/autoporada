import type { Campus } from '@/domain/cs';
import type { PointKind } from '@/domain/report';
import type { PointState } from '@/domain/review';

/** „Body“: starting a point and the header and values of one point. */
export const points = {
  title: {
    new: 'Nový bod',
    point: 'Bod',
  },
  chooser: {
    legend: 'Typ bodu',
    start: 'Začít',
    required: 'Vyberte typ bodu.',
    invalid: 'Tento typ už není v\u00A0nabídce. Vyberte jiný.',
  },
  untitled: 'Bez názvu',
  kind: {
    report: 'Zpráva',
    finance: 'Hospodaření',
    pokyn: 'Pokyn',
  } as const satisfies Record<PointKind, string>,
  /** One label per state, singular: it names the point, not a list. */
  state: {
    draft: 'Rozpracovaný',
    submitted: 'Čeká na kontrolu',
    returned: 'Vrácený k\u00A0úpravě',
    approved: 'Schválený',
    rejected: 'Zamítnutý',
    withdrawn: 'Zrušený',
    published: 'Zařazený do porady',
  } as const satisfies Record<PointState, string>,
  campus: {
    smichov: 'Šmíchov',
    radlice: 'Radlice',
    'na-vidouli': 'Na Vidouli',
    jinde: 'Jinde',
  } as const satisfies Record<Campus, string>,
  facts: {
    eventDate: 'Datum začátku',
    endDate: 'Datum konce',
    timeFrom: 'Čas od',
    timeTo: 'Čas do',
    campus: 'Areál',
    place: 'Místo',
    none: 'Zatím bez údajů.',
  },
  /** The report editor's fields; the labels it shares with the read view are in `facts`. */
  editor: {
    type: 'Typ',
    title: 'Název',
    placeHint: 'například v\u00A0učebně S206',
    body: 'Další odstavce',
    /** The contract refuses an end date before the start, or one with no start at all. */
    endBeforeStart: 'Datum konce nesmí být před datem začátku.',
    endWithoutStart: 'Vyplňte také datum začátku.',
    /** The content as a whole is over its size cap: the one issue that names no field. */
    tooLong: 'Bod je příliš dlouhý. Zkraťte některé texty nebo odeberte část osob.',
  },
  /** The opening sentence: made from the fields until the author writes it themselves. */
  opening: {
    label: 'Úvodní věta',
    changed: 'Údaje se změnily. Úvodní větu jste upravili ručně.',
    recreate: 'Vytvořit znovu',
    confirm: 'Nahradit vaši větu novou?',
    replace: 'Ano, nahradit',
    keep: 'Ponechat',
  },
  /** The type's bullets and the author's own (design section 7). */
  bullets: {
    order: 'Pořadí',
    orderOption: {
      input: 'V\u00A0pořadí zadání',
      'class-surname': 'Podle třídy a\u00A0příjmení',
    } as const satisfies Record<'input' | 'class-surname', string>,
    label: 'Název řádku',
    /** Names a row the author has not named yet, counting from one. */
    unnamed: (n: number) => `Řádek č.\u00A0${n}`,
    /** The search box inside a people row; the row's legend says whose people. */
    addPerson: 'Přidat osobu',
    /** Names the chip list of a row, so several lists on the page are told apart. */
    peopleList: (label: string) => `Osoby: ${label}`,
    addPeopleRow: 'Přidat řádek s\u00A0osobami',
    addTextRow: 'Přidat řádek s\u00A0textem',
    remove: 'Odebrat řádek',
    removeLabel: (label: string) => `Odebrat řádek „${label}“`,
    removeUnnamed: (n: number) => `Odebrat řádek č.\u00A0${n}`,
    full: (limit: number) => `Bod může mít nejvýše ${limit}\u00A0řádků.`,
    /** Brings back a row of the type the author took out; `label` is the type's. */
    restore: (label: string) => `Vrátit řádek „${label}“`,
    /** Under a people row the contract refused. */
    tooManyPeople: 'Řádek má příliš mnoho osob.',
  },
  /** The statements of a report (design section 7). */
  statements: {
    heading: 'Vyjádření',
    legend: (n: number) => `Vyjádření č.\u00A0${n}`,
    speaker: 'Kdo',
    /** Opens the one-slot people field. */
    other: 'Jiná osoba…',
    /** The select's first option while nobody is chosen yet. */
    choose: 'Vyberte…',
    /** Names the people field of „Jiná osoba…“, so the cards' fields are told apart. */
    otherList: (n: number) => `Mluvčí: vyjádření č.\u00A0${n}`,
    genitive: 'Ve 2.\u00A0pádě',
    /** Under the genitive while the speaker has no salutation yet. */
    needSalutation: 'Nejdřív zvolte oslovení.',
    /** Under the genitive while it is the unchecked suggestion. */
    check: (suggestion: string) => `Zkontrolujte tvar: ${suggestion}`,
    affiliation: 'Funkce nebo třída',
    quote: 'Citace',
    up: 'Nahoru',
    down: 'Dolů',
    remove: 'Odebrat',
    /** The buttons' accessible names carry the card's number. */
    upLabel: (n: number) => `Nahoru vyjádření č.\u00A0${n}`,
    downLabel: (n: number) => `Dolů vyjádření č.\u00A0${n}`,
    removeLabel: (n: number) => `Odebrat vyjádření č.\u00A0${n}`,
    add: 'Přidat vyjádření',
    full: (limit: number) => `Bod může mít nejvýše ${limit}\u00A0vyjádření.`,
  },
} as const;
