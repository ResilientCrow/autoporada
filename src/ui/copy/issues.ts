/** „Nejbližší porady“: the headmaster's strip on the Přehled. */
export const issues = {
  strip: {
    title: 'Nejbližší porady',
    unconfirmed: 'Potvrďte prosím změnu.',
    meeting: (label: string) => `Porada ${label}`,
    stale: 'Tato porada už není v\u00a0kalendáři. Načtěte prosím stránku.',
    said: {
      skip: (label: string) => `Porada ${label} se nekoná.`,
      unskip: (label: string) => `Porada ${label} se koná.`,
    },
    skip: {
      confirm: 'Rozumím, že body určené na tuto poradu půjdou do další porady.',
      submit: 'Porada se nekoná',
    },
    unskip: {
      confirm: 'Rozumím, že body určené na tuto poradu se do ní vrátí.',
      submit: 'Porada se koná',
    },
  },
} as const;
