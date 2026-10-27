import { countWord, type PluralForms } from '@/domain/cs';

/** „osoba“, „osoby“, „osob“: the count in the announcements. */
const PERSON: PluralForms = { one: 'osoba', few: 'osoby', many: 'osob' };

/** „Osoby“: the people picker (design section 5): the search box, and the chips below it. */
export const people = {
  search: {
    recents: 'Dříve použité',
    directory: 'Z\u00A0adresáře školy',
    manual: (text: string) => `Přidat ručně: ${text}`,
    /** Said after an add, without gender: the total counts the person just added. */
    added: (name: string, total: number) =>
      `Přidáno: ${name}. Celkem: ${countWord(total, PERSON)}.`,
    notice: {
      off: 'Hledání v\u00A0adresáři školy zatím není zapnuté. Osobu vyberte z\u00A0dříve použitých nebo ji zadejte ručně.',
      down: 'Adresář školy teď neodpovídá. Osobu můžete zadat ručně.',
      rateLimited: 'Hledáte příliš rychle. Zkuste to za chvíli, nebo osobu zadejte ručně.',
      signedOut: 'Byli jste odhlášeni. Hledání v\u00A0adresáři bude fungovat po novém přihlášení.',
    },
  },
  chips: {
    edit: 'Upravit',
    remove: 'Odebrat',
    /**
     * The buttons' accessible names carry the person, or a list of them sounds the same
     * everywhere; after a colon, so the name stays in the nominative.
     */
    editLabel: (name: string) => `Upravit: ${name}`,
    removeLabel: (name: string) => `Odebrat: ${name}`,
    /** Names the open editor. */
    editorLabel: (name: string) => `Úprava: ${name}`,
    flag: { salutation: 'Zvolte oslovení', class: 'ověřte třídu' },
    /** Said after Odebrat; the total no longer counts the person. */
    removed: (name: string, total: number) =>
      `Odebráno: ${name}. Celkem: ${countWord(total, PERSON)}.`,
    /** Said after Nahoru or Dolů; `place` counts from one. */
    moved: (name: string, place: number, total: number) =>
      `${name}, pozice ${place} z\u00A0${total}.`,
    /** Shown and said when an add is refused at the cap. */
    full: (limit: number) => `Osobu nelze přidat: nejvýše ${countWord(limit, PERSON)}.`,
    bulk: {
      label: 'Všem nastavit oslovení:',
      setLabel: (salutation: string) => `Všem nastavit oslovení: ${salutation}`,
      /** Said after it; `count` is the people it set. */
      done: (count: number) => `Oslovení nastaveno: ${countWord(count, PERSON)}.`,
    },
    editor: {
      salutation: 'Oslovení',
      none: 'Nezvoleno',
      affiliation: 'Třída nebo organizace',
      givenName: 'Jméno',
      familyName: 'Příjmení',
      titlesBefore: 'Tituly před',
      titlesAfter: 'Tituly za',
      classValid: 'Třída platí',
      up: 'Nahoru',
      down: 'Dolů',
      done: 'Hotovo',
    },
  },
} as const;
