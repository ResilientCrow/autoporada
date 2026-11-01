export const gallery = {
  title: 'Vzorník',
  intro:
    'Tato stránka existuje jen ve vývoji a\u00A0v\u00A0testech. Ukazuje části, které žádná skutečná stránka nepoužívá.',
  errorPage: 'Ukázat chybovou stránku',
  statuses: {
    title: 'Stavy',
    neutral: 'Koncept',
    waiting: 'Odesláno',
    done: 'Schváleno',
    attention: 'Vráceno',
    stopped: 'Zamítnuto',
  },
  statusMaps: {
    title: 'Stavy v\u00A0aplikaci',
    access: 'Žádost o\u00A0přístup',
    role: 'Role',
    account: 'Účet',
  },
  buttons: {
    title: 'Tlačítka',
    primary: 'Hlavní akce',
    secondary: 'Vedlejší akce',
    disabled: 'Nedostupná akce',
    pending: 'Odesílá se',
    onDark: 'Na tmavém pozadí',
  },
  layout: {
    title: 'Rozvržení',
    stacks: 'Mezery mezi bloky',
    item: 'Uvnitř jedné položky: 8\u00A0px',
    block: 'Mezi bloky oddílu: 16\u00A0px',
    section: 'Mezi oddíly stránky: 32\u00A0px',
    cluster: 'Řada, která se zalamuje',
    columns: 'Dva sloupce od\u00A0malé šířky',
    left: 'Levý sloupec',
    right: 'Pravý sloupec',
    sectionDivided: 'Oddíl s\u00A0dělicí čárou',
    sectionBody: 'Obsah oddílu je 12\u00A0px pod nadpisem.',
    headerMeta: 'Jen pro vývoj',
  },
  lists: {
    title: 'Seznamy',
    items: 'Seznam položek',
    first: 'První položka',
    second: 'Druhá položka s\u00A0nadpisem',
    meta: 'Vedlejší řádek: datum nebo počet',
    bullets: 'Odrážky',
    bullet: ['První odrážka', 'Druhá odrážka'],
    facts: 'Údaje',
    fact: [
      ['Termín', 'Pondělí 3.\u00A0února'],
      ['Místo', 'Zasedací místnost'],
    ],
  },
  disclosure: {
    title: 'Rozbalovací část',
    summary: 'Zobrazit podrobnosti',
    body: 'Rozbalí se bez JavaScriptu a\u00A0po změně stránky zůstane zavřená.',
  },
  notices: {
    title: 'Oznámení',
    info: 'Změny se ukládají průběžně.',
    problem: 'Zprávu se nepodařilo odeslat.',
  },
  problems: {
    title: 'Chyby při odeslání',
    /** The technical line development adds under an `unavailable` failure (ADR 0044). */
    detail: 'DatabaseFailure 08000 (databáze na\u00A0localhost:5432, spusťte pnpm dev:services)',
    code: {
      'invalid-input': 'Bez označeného pole',
      unauthenticated: 'Vypršelo přihlášení',
      'step-up-required': 'Je třeba potvrdit totožnost',
      forbidden: 'Bez oprávnění',
      'not-found': 'Položka nenalezena',
      conflict: 'Střet změn',
      busy: 'Položka je zaneprázdněná',
      rule: 'Porušené pravidlo',
      'rate-limited': 'Příliš mnoho pokusů',
      unavailable: 'Služba nedostupná',
      network: 'Spojení selhalo',
    },
  },
  people: {
    title: 'Výběr osob',
    live: {
      label: 'Přidat osobu',
      hint: 'Zkuste „nov“, „Karel Dvořák“ nebo slova „chyba“, „rychle“ a\u00A0„odhlášen“ pro jednotlivá oznámení.',
    },
    off: { label: 'Přidat osobu (adresář vypnutý)' },
    added: 'Přidané osoby',
    chips: {
      label: 'Přidat osobu (s\u00A0již přidanými)',
      list: 'Osoby s\u00A0již přidanými',
      hint: 'Dva lidé mají co ověřit: jeden nemá zvolené oslovení, druhý třídu z\u00A0loňského roku. Přidat se dá jen jedna osoba navíc.',
      /** The demo's form is only there to show that a key in the field does not send it. */
      send: 'Odeslat',
    },
    paste: {
      /** Shown above the demos, so a visitor can use „Vložit seznam“. */
      hint: 'Do\u00A0„Vložit seznam“ zkuste vložit:',
      /**
       * Five lines to read: a class, a name order that is a guess, one in the other order that
       * a recent person settles, and one that is no person.
       */
      sample: ['Lenka Marešová 3.B', 'Zdislav Hruška', 'Hlaváček Radslav', 'Marie', 'Ondřej Pech'],
    },
    triggers: { down: 'chyba', rateLimited: 'rychle', signedOut: 'odhlasen' },
  },
  richtext: {
    title: 'Textový editor',
    label: 'Text bodu',
    paragraphs: 'Text bez odsazení',
  },
  autosave: {
    title: 'Automatické ukládání',
    label: 'Poznámka',
    hint: 'Ukládá se po pauze 1,5\u00A0sekundy, při opuštění pole a\u00A0při odchodu ze stránky. Tlačítka níže určují, jak skončí příští uložení.',
    arm: {
      ok: 'Bez potíží',
      conflict: 'Střet',
      failed: 'Selhání',
      locked: 'Zamčený bod',
      signedOut: 'Odhlášení',
    },
    armed: (what: string) => `Příští uložení: ${what}`,
    refreshed: (count: number) => `Aktuální stav načten: ${count}`,
    leave: 'Odejít na úvodní stránku',
  },
  forms: {
    title: 'Formulář',
    submit: 'Odeslat',
    plain: {
      name: 'Jméno',
      nickname: 'Přezdívka',
      nicknameHint: 'Zobrazí se ostatním žákům.',
      reason: 'Důvod žádosti',
    },
    live: {
      name: 'Jméno',
      reason: 'Důvod žádosti',
      reasonTooLong: 'Důvod může mít nejvýše 40\u00A0znaků.',
      sent: 'Formulář je v\u00A0pořádku.',
      networkTrigger: 'spojení',
    },
    controls: {
      title: 'Výběr a\u00A0zaškrtnutí',
      role: 'Role',
      roleHint: 'Určuje, co v\u00A0aplikaci uvidíte.',
      agree: 'Souhlasím s\u00A0podmínkami',
      agreeHint: 'Bez souhlasu nelze pokračovat.',
      options: { student: 'Student', teacher: 'Učitel' },
      shift: 'Směna',
      shifts: { morning: 'Ranní', afternoon: 'Odpolední' },
    },
    failed: {
      name: 'Jméno',
      reason: 'Důvod žádosti',
      reasonTooLong: 'Důvod je delší, než je povoleno.',
    },
  },
} as const;
