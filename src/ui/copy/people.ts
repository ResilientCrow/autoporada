import { countWord, PASTE_MAX_CHARS, PASTE_MAX_LINES, type PluralForms } from '@/domain/cs';

/** „osoba“, „osoby“, „osob“: the count in the announcements. */
const PERSON: PluralForms = { one: 'osoba', few: 'osoby', many: 'osob' };

/** What every directory notice ends with: the box still takes a typed name. */
const MANUAL = 'Osobu můžete zadat ručně.';

/** „Osoby“: the people picker (design section 5): the search box, and the chips below it. */
export const people = {
  /** „1 osoba“, „3 osoby“, „5 osob“: a count under a row's legend. */
  count: (n: number) => countWord(n, PERSON),
  search: {
    recents: 'Dříve použité',
    directory: 'Z\u00A0adresáře školy',
    manual: (text: string) => `Přidat ručně: ${text}`,
    /** Said after an add, without gender: the total counts the person just added. */
    added: (name: string, total: number) =>
      `Přidáno: ${name}. Celkem: ${countWord(total, PERSON)}.`,
    notice: {
      off: 'Hledání v\u00A0adresáři školy zatím není zapnuté. Osobu vyberte z\u00A0dříve použitých nebo ji zadejte ručně.',
      manual: MANUAL,
      /** An answer that is not ours (a proxy's, junk): all that is known is that it did not come. */
      down: `Adresář školy teď neodpovídá. ${MANUAL}`,
      unavailable: `Adresář školy (Microsoft) teď neodpovídá. ${MANUAL}`,
      timeout: `Adresář školy neodpověděl včas. ${MANUAL}`,
      denied: `Aplikace nemá v\u00A0Microsoftu oprávnění hledat osoby. Dejte to prosím vědět správci. ${MANUAL}`,
      /** The route itself failed: what broke (`failures`), then the way round it. */
      failed: (what: string) => `${what} ${MANUAL}`,
      rateLimited: 'Hledáte příliš rychle. Zkuste to za chvíli, nebo osobu zadejte ručně.',
      signedOut: 'Byli jste odhlášeni. Hledání v\u00A0adresáři bude fungovat po novém přihlášení.',
    },
  },
  paste: {
    summary: 'Vložit seznam',
    label: 'Seznam osob',
    hint: `Jedna osoba na\u00A0řádek, nejvýše ${PASTE_MAX_LINES}\u00A0řádků a\u00A0${PASTE_MAX_CHARS}\u00A0znaků. Třídu připište za jméno, například „Jana Nováková 3.B“.`,
    check: 'Zkontrolovat',
    /** Beside the preview when the text was longer than the limits. */
    truncated: `Seznam byl zkrácen: čte se nejvýše ${PASTE_MAX_LINES}\u00A0řádků a\u00A0${PASTE_MAX_CHARS}\u00A0znaků.`,
    /** The preview found no one and rejected nothing. */
    nothing: 'V\u00A0textu nebyla nalezena žádná osoba.',
    /** Said once after „Zkontrolovat“; `rejected` counts the lines that are no person. */
    read: (count: number, rejected: number) =>
      `Přečteno: ${countWord(count, PERSON)}.${rejected === 0 ? '' : ` Nelze přečíst řádků: ${rejected}.`}`,
    caption: 'Náhled seznamu',
    columns: { pick: 'Přidat', person: 'Přečteno', salutation: 'Oslovení', check: 'Kontrola' },
    /** The checkbox's name carries the line as typed, so a long table is not a column of the same word. */
    pickLabel: (source: string) => `Přidat: ${source}`,
    salutationLabel: (source: string) => `Oslovení: ${source}`,
    doubt: 'Zkontrolujte jméno',
    swap: 'Prohodit jméno a\u00A0příjmení',
    swapLabel: (source: string) => `Prohodit jméno a\u00A0příjmení: ${source}`,
    bulk: {
      label: 'Řádkům bez oslovení nastavit:',
      setLabel: (salutation: string) => `Řádkům bez oslovení nastavit: ${salutation}`,
    },
    rejected: {
      title: 'Tyto řádky nelze přečíst:',
      line: (line: number) => `Řádek ${line}:`,
      reason: {
        'no-surname': 'chybí příjmení',
        'too-long': 'jméno, titul nebo třída je příliš dlouhá',
      },
    },
    add: (count: number) => `Přidat vybrané (${count})`,
    /** Said once after the add; `needLook` counts the added people that still ask for a look. */
    added: (count: number, needLook: number) =>
      `Přidáno: ${countWord(count, PERSON)}. Kontrolu vyžadují: ${needLook}.`,
    /** Added to it when some rows did not fit under the cap; they stay in the preview. */
    leftOut: (count: number) => `Nevešlo se: ${countWord(count, PERSON)}.`,
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
