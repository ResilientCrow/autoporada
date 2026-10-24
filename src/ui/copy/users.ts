/** „Uživatelé“: the list of people and, later, the queue and the detail. */
export const users = {
  title: 'Uživatelé',
  people: {
    title: 'Lidé',
    searchLabel: 'Hledat podle jména nebo e-mailu',
    search: 'Hledat',
    groupsLabel: 'Skupiny uživatelů',
    groups: {
      all: 'Všichni',
      pending: 'Bez přístupu',
      submitter: 'Přispěvatelé',
      reviewer: 'Kontroloři',
      headmaster: 'Ředitelé',
      inactive: 'Neaktivní',
    },
    found: (n: number) => `Nalezeno: ${n}`,
    capped: (shown: number, total: number) =>
      `Zobrazeno prvních ${shown} z\u00A0${total}. Upřesněte prosím hledání.`,
    empty: 'Hledání nic nenašlo.',
  },
} as const;
