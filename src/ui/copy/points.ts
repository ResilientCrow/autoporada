import type { Campus } from '@/domain/cs';
import type { Params, PointKind, ProblemCode, Warning } from '@/domain/report';
import type { PointState } from '@/domain/review';

const word = (params: Params, key: string): string => String(params[key]);
const words = (params: Params, key: string): string => {
  const value = params[key];
  return Array.isArray(value) ? value.join(', ') : String(value);
};

/** What each readiness problem says; a new code in the domain fails the type check until it is written here. */
const PROBLEM: Readonly<Record<ProblemCode, (params: Params) => string>> = {
  'title-required': () => 'Vyplňte název.',
  'body-required': () => 'Vyplňte text návrhu.',
  'body-too-long': () => 'Text je příliš dlouhý.',
  'event-date-required': () => 'Vyplňte datum začátku.',
  'time-to-without-from': () => 'Vyplňte také čas od.',
  'time-to-before-from': () => 'Čas do musí být později než čas od.',
  'opening-required': () => 'Úvodní věta nesmí být prázdná.',
  'label-required': (p) => `Pojmenujte řádek č.\u00A0${word(p, 'n')}.`,
  'people-required': (p) => `Doplňte alespoň jednu osobu do řádku „${word(p, 'label')}“.`,
  'text-required': (p) => `Vyplňte řádek „${word(p, 'label')}“.`,
  'people-none': () => 'Doplňte alespoň jednu osobu.',
  'person-name-required': (p) =>
    `Doplňte příjmení u osoby č.\u00A0${word(p, 'position')} v\u00A0řádku „${word(p, 'label')}“.`,
  'salutation-required': (p) => `U osoby ${word(p, 'name')} zvolte oslovení.`,
  'class-stale': (p) => `Ověřte třídu u osob: ${words(p, 'names')}.`,
  'statements-required': () => 'Přidejte alespoň jedno vyjádření.',
  'speaker-required': (p) => `U vyjádření č.\u00A0${word(p, 'n')} zvolte, kdo mluví.`,
  'genitive-required': (p) =>
    `U vyjádření č.\u00A0${word(p, 'n')} vyplňte jméno mluvčího ve 2.\u00A0pádě.`,
  'quote-required': (p) => `U vyjádření č.\u00A0${word(p, 'n')} vyplňte citaci.`,
};

/** What each readiness warning says; a new warning code in the domain fails the type check until it is written here. */
const WARNING: Readonly<Record<Warning['code'], (params: Params) => string>> = {
  // Not a problem: a speaker picked through „Jiná osoba…“ never was a participant.
  'speaker-not-participant': (p) => `Mluvčí ${word(p, 'name')} není mezi účastníky.`,
};

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
  /** The live preview of the point (design section 8). */
  preview: {
    label: 'Náhled bodu',
    empty: 'Náhled se zobrazí, až vyplníte název a\u00A0datum začátku.',
    /** Colon form, so no noun has to agree with the count. */
    omittedPeople: (n: number) =>
      `Osoby bez oslovení nebo příjmení se v\u00A0náhledu nezobrazí: ${n}.`,
    omittedRows: (n: number) =>
      `Prázdné nebo nepojmenované řádky se v\u00A0náhledu nezobrazí: ${n}.`,
    omittedStatements: (n: number) => `Neúplná vyjádření se v\u00A0náhledu nezobrazí: ${n}.`,
  },
  /** The list under the form and the button that hands the point in (design sections 6 and 9). */
  readiness: {
    heading: 'Před odesláním',
    ok: 'Vše potřebné je vyplněno.',
    problems: 'Chybí nebo nesedí',
    warnings: 'Stojí za kontrolu',
    problem: (code: ProblemCode, params: Params) => PROBLEM[code](params),
    warning: (code: Warning['code'], params: Params) => WARNING[code](params),
  },
  submit: {
    button: 'Odeslat ke kontrole',
  },
  /** Below the wide layout the form and the preview take turns. */
  layout: {
    legend: 'Zobrazit',
    form: 'Formulář',
    preview: 'Náhled',
  },
} as const;
