/** „Nastavení“: where the headmaster sets the deadline rule, the reminders and the annex 1 texts. */
export const settings = {
  title: 'Nastavení',
  typesLink: 'Typy bodů',
  said: { changed: 'Nastavení je uloženo.', unchanged: 'Nic se nezměnilo.' },
  save: 'Uložit',
  deadline: {
    title: 'Uzávěrka',
    intro: 'Kdy se uzavírá odevzdávání bodů na poradu, počítáno od dne porady.',
    days: { label: 'Uzávěrka je' },
    time: { label: 'Čas uzávěrky' },
    dayOptions: {
      1: '1 den před poradou',
      2: '2 dny před poradou',
      3: '3 dny před poradou',
      4: '4 dny před poradou',
    },
    timeOption: (time: string) => `v ${time}`,
    example: (day: string, time: string) => `U pondělní porady: ${day} ${time}`,
    effect: (keep: string, day: string, time: string, from: string) =>
      `Uzávěrka porady ${keep} zůstává ${day} ${time}. Nové pravidlo platí od porady ${from}. Uzávěrky přesunutých porad se nemění.`,
  },
  reminders: {
    title: 'Připomínky',
    intro: 'E-maily autorům před uzávěrkou. Vypnutý druh se nepošle nikomu.',
    soft: 'Připomínka dva dny před uzávěrkou',
    hard: 'Upozornění v den uzávěrky',
  },
  annex1: {
    title: 'Texty přílohy 1',
    heading: { label: 'Nadpis', tooLong: 'Nadpis je příliš dlouhý.' },
    intro: {
      label: 'Úvodní text',
      description:
        'Odstavce oddělte prázdným řádkem. Zápis {skolniRok} se v dokumentu nahradí školním rokem.',
      tooLong: 'Text je příliš dlouhý.',
    },
  },
} as const;
