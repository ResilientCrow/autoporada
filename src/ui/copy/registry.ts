import { countWord, type PluralForms } from '@/domain/cs';

const STUDENT: PluralForms = { one: 'student', few: 'studenti', many: 'studentů' };
const NEW: PluralForms = { one: 'nový', few: 'noví', many: 'nových' };

/** „Registr“: the lists of students the document prints, kept by the headmaster, read by the staff. */
export const registry = {
  title: 'Registr',
  intro:
    'Seznamy studentů, které se tisknou do zápisu z\u00a0porady. Jména studentů vidí jen vedení školy a kontroloři.',
  new: 'NOVÉ',
  newHint: 'Dosud nebyl v\u00a0žádném vytištěném zápisu.',
  said: {
    changed: 'Změna je uložena.',
    unchanged: 'Nic se nezměnilo.',
    created: 'Seznam je přidán.',
    added: 'Student je přidán.',
    removed: 'Student je odebrán.',
    moved: 'Pořadí je změněno.',
  },
  save: 'Uložit',
  lists: {
    title: 'Seznamy',
    empty: 'Zatím tu není žádný seznam.',
    counts: (active: number, fresh: number) =>
      `${countWord(active, STUDENT)}, z\u00a0toho ${countWord(fresh, NEW)}`,
    open: 'Otevřít seznam',
    off: 'vypnuto',
    move: {
      up: 'Nahoru',
      down: 'Dolů',
      label: (title: string) => `Pořadí seznamu ${title}`,
    },
    edit: 'Upravit seznam',
    annex1: 'Příloha\u00a01',
    fixed: 'Seznam pro Přílohu\u00a01 nelze vypnout.',
    create: { title: 'Nový seznam', save: 'Přidat seznam' },
    fields: {
      title: { label: 'Název', tooLong: 'Název je příliš dlouhý.' },
      docLabel: {
        label: 'Název v\u00a0dokumentu',
        description: 'Tak se seznam jmenuje v\u00a0zápisu z\u00a0porady.',
        tooLong: 'Název je příliš dlouhý.',
      },
      active: { label: 'Nabízet seznam' },
    },
  },
  newYear: {
    title: 'Nový školní rok',
    link: 'Nový školní rok',
    intro:
      'Vybrané seznamy se vyprázdní. Studenti, kteří byli v\u00a0některém vytištěném zápisu, se přesunou do archivu, ostatní se smažou. Samotné seznamy zůstanou.',
    lists: { label: 'Seznamy k\u00a0vyprázdnění', none: 'Nejsou žádné seznamy.' },
    list: (title: string, n: number) => `${title} (${countWord(n, STUDENT)})`,
    count: (n: number) => `Vyprázdní se ${countWord(n, STUDENT)}.`,
    year: {
      label: 'Školní rok, který končí',
      description: 'Pod tímto rokem se studenti uloží do archivu.',
    },
    confirm: 'Rozumím, že vybrané seznamy se vyprázdní a\u00a0studenti se přesunou do archivu.',
    submit: 'Vyprázdnit vybrané seznamy',
    issues: {
      listIds: 'Vyberte aspoň jeden seznam.',
      confirmed: 'Potvrďte, že rozumíte důsledkům.',
    },
    done: (archived: number, deleted: number) =>
      `Hotovo. V\u00a0archivu je ${countWord(archived, STUDENT)}, smazáno ${countWord(deleted, STUDENT)}.`,
    back: 'Všechny seznamy',
  },
  paste: {
    title: 'Vložit seznam',
    intro:
      'Vložte seznam jmen, třeba ve tvaru z\u00a0dokumentu: „Jana Nováková (1.A), Patricie Nováková, Anna Nováková (obě 2.B)“. Nejdřív uvidíte, co se přidá; nic se neuloží, dokud to nepotvrdíte.',
    text: {
      label: 'Seznam jmen',
      description: 'Nejvýše 20\u00a0000 znaků a\u00a0200 jmen.',
      tooLong: 'Text je příliš dlouhý nebo má víc než 200 jmen.',
    },
    order: {
      label: 'Pořadí jmen',
      givenFamily: 'Jméno Příjmení',
      familyGiven: 'Příjmení Jméno',
    },
    check: 'Zkontrolovat',
    preview: {
      title: 'Co se přidá',
      empty: 'V\u00a0textu není žádné jméno.',
      caption: 'Jména z\u00a0vloženého seznamu',
      pick: 'Přidat',
      givenName: 'Jméno',
      familyName: 'Příjmení',
      classCode: 'Třída',
      notes: 'Poznámky',
      none: 'bez třídy',
      add: (n: number) => `Přidat vybrané (${n})`,
      pickLabel: (source: string) => `Přidat: ${source}`,
    },
    problems: {
      'name-missing': 'Chybí jméno nebo příjmení.',
      'class-missing': 'Chybí třída.',
      'class-unknown': 'Třídu se nepodařilo přečíst.',
      duplicate: 'Student už na seznamu je.',
    },
    groupCount: (word: string) => `Počet jmen nesedí se slovem ${word}. Zkontrolujte třídu.`,
    added: (n: number) => `Přidáno: ${countWord(n, STUDENT)}.`,
    back: 'Zpět na seznam',
  },
  entries: {
    back: 'Všechny seznamy',
    empty: 'Seznam je prázdný.',
    paste: 'Vložit seznam',
    add: { title: 'Přidat studenta', save: 'Přidat studenta' },
    edit: 'Upravit',
    cancel: 'Zrušit',
    remove: 'Odebrat',
    about: (name: string) => ` (${name})`,
    fields: {
      givenName: { label: 'Jméno', tooLong: 'Jméno je příliš dlouhé.' },
      familyName: { label: 'Příjmení', tooLong: 'Příjmení je příliš dlouhé.' },
      classCode: {
        label: 'Třída',
        description: 'Například 1.A nebo L1B.',
        invalid: 'Třídu zapište například jako 1.A.',
      },
    },
  },
} as const;
