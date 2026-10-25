import { countWord, type PluralForms } from '@/domain/cs';

/** „osoba“, „osoby“, „osob“: the count in the announcements. */
const PERSON: PluralForms = { one: 'osoba', few: 'osoby', many: 'osob' };

/** „Osoby“: the people picker, here its search box (design section 5). */
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
} as const;
