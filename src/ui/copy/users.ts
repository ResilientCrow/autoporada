/** „Uživatelé“: the list of people and, later, the queue and the detail. */
export const users = {
  title: 'Uživatelé',
  queue: {
    title: 'Žádosti o\u00A0přístup',
    empty: 'Nic nečeká na rozhodnutí.',
    submitted: (date: string) => `Podáno ${date}`,
    reason: 'Důvod',
    approveStaff: 'Schválit jako zaměstnance',
    approveStudent: 'Schválit jako studenta',
    reject: 'Zamítnout',
    studentHint: 'Student smí jen posílat podklady.',
    said: {
      approved: 'Žádost byla schválena. Uživatel se musí znovu přihlásit.',
      rejected: 'Žádost byla zamítnuta.',
    },
  },
  detail: {
    title: 'Uživatel',
    email: 'E-mail',
    role: 'Role',
    account: 'Účet',
    since: (date: string) => `V\u00A0Autoporadě od ${date}`,
    request: 'Žádost o\u00A0přístup',
    decided: (date: string) => `Rozhodnuto ${date}`,
    details: 'Podrobnosti',
    block: {
      title: 'Zablokovat další žádosti',
      text: 'Uživatel už nebude moci požádat o\u00A0přístup. Blokaci žádosti nelze zrušit; přístup lze ale udělit ručně v\u00A0části Role a\u00A0typ uživatele.',
      confirm: 'Rozumím, že další žádosti nebudou přijímány.',
      unconfirmed: 'Potvrďte prosím změnu.',
      submit: 'Zablokovat další žádosti',
      said: 'Další žádosti jsou zablokovány.',
    },
  },
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
