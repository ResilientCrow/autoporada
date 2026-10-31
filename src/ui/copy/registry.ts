import { countWord, type PluralForms } from '@/domain/cs';

const STUDENT: PluralForms = { one: 'student', few: 'studenti', many: 'studentů' };
const NEW: PluralForms = { one: 'nový', few: 'noví', many: 'nových' };

/** „Registr“: the lists of students the document prints, kept by the headmaster, read by the staff. */
export const registry = {
  title: 'Registr',
  intro:
    'Seznamy studentů, které se tisknou do zápisu z porady. Jména studentů vidí jen vedení školy a kontroloři.',
  new: 'NOVÉ',
  newHint: 'Dosud nebyl v žádném vytištěném zápisu.',
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
      `${countWord(active, STUDENT)}, z toho ${countWord(fresh, NEW)}`,
    open: 'Otevřít seznam',
    off: 'vypnuto',
    move: {
      up: 'Nahoru',
      down: 'Dolů',
      label: (title: string) => `Pořadí seznamu ${title}`,
    },
    edit: 'Upravit seznam',
    annex1: 'Příloha 1',
    fixed: 'Seznam pro Přílohu 1 nelze vypnout.',
    create: { title: 'Nový seznam', save: 'Přidat seznam' },
    fields: {
      title: { label: 'Název', tooLong: 'Název je příliš dlouhý.' },
      docLabel: {
        label: 'Název v dokumentu',
        description: 'Tak se seznam jmenuje v zápisu z porady.',
        tooLong: 'Název je příliš dlouhý.',
      },
      active: { label: 'Nabízet seznam' },
    },
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
