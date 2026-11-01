/** „Nastavení“: where the headmaster sets the deadline rule, the reminders and the annex 1 texts. */
export const settings = {
  title: 'Nastavení',
  usersLink: 'Uživatelé',
  typesLink: 'Typy bodů',
  said: { changed: 'Nastavení je uloženo.' },
  save: 'Uložit',
  deadline: {
    title: 'Uzávěrka',
    intro: 'Kdy se uzavírá odevzdávání bodů na poradu, počítáno od dne porady.',
    days: { label: 'Uzávěrka je' },
    time: { label: 'Čas uzávěrky' },
    dayOptions: {
      1: '1\u00a0den před poradou',
      2: '2\u00a0dny před poradou',
      3: '3\u00a0dny před poradou',
      4: '4\u00a0dny před poradou',
    },
    timeOption: (time: string) => `v\u00a0${time}`,
    example: (day: string, time: string) => `U\u00a0pondělní porady: ${day} ${time}`,
    effect: (keep: string, day: string, time: string, from: string) =>
      `Uzávěrka porady ${keep} zůstává ${day} ${time}. Nové pravidlo platí od porady ${from}. Ručně nastavené uzávěrky se nemění.`,
  },
  reminders: {
    title: 'Připomínky',
    intro: 'E-maily autorům před uzávěrkou. Vypnutý druh se nepošle nikomu.',
    soft: 'Připomínka zprávy z\u00a0akce dva dny před uzávěrkou',
    hard: 'Upozornění v\u00a0den uzávěrky',
  },
  annex1: {
    title: 'Texty přílohy 1',
    heading: { label: 'Nadpis', tooLong: 'Nadpis je příliš dlouhý.' },
    intro: {
      label: 'Úvodní text',
      description: 'Zápis {skolniRok} se v\u00a0dokumentu nahradí školním rokem.',
      tooLong: 'Text je příliš dlouhý.',
    },
  },
} as const;
