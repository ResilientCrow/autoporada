/** Labels of the domain statuses; ui/status maps each status to one of these and a tone. */
export const status = {
  access: {
    pending: 'Čeká na rozhodnutí',
    approved: 'Schváleno',
    rejected: 'Zamítnuto',
    blocked: 'Zablokováno',
    cancelled: 'Zrušeno',
  },
  role: {
    pending: 'Bez přístupu',
    submitter: 'Přispěvatel',
    reviewer: 'Vedení',
    headmaster: 'Ředitel',
  },
  account: {
    active: 'Aktivní',
    blocked: 'Zablokovaný',
    deactivated: 'Deaktivovaný',
  },
  issue: {
    open: 'Koná se',
    generated: 'Vygenerováno',
  },
  student: 'Student',
} as const;
