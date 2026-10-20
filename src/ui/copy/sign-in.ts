import type { SignInError } from '@/contracts';

export const signIn = {
  title: 'Přihlášení',
  intro: 'Přihlaste se svým školním účtem Microsoft 365.',
  button: 'Přihlásit se účtem Microsoft 365',
  switchAccount: 'Přihlásit se jiným účtem',
  errors: {
    expired: 'Přihlášení vypršelo nebo už bylo použito. Přihlaste se prosím znovu.',
    cancelled: 'Přihlášení bylo zrušeno.',
    'not-member':
      'Přihlásit se lze jen školním účtem Microsoft 365. Účty hostů a\u00A0jiných organizací povoleny nejsou.',
    blocked: 'Váš účet je v\u00A0Autoporadě zablokovaný. Obraťte se prosím na vedení školy.',
    'step-up-mismatch': 'Ověřte se prosím stejným účtem, kterým jste přihlášeni.',
    'step-up-stale': 'Ověření se nepodařilo dokončit. Při přihlášení prosím znovu zadejte heslo.',
    failed:
      'Přihlášení se nepodařilo. Zkuste to prosím znovu; pokud potíže trvají, pošlete správci kód chyby.',
    unavailable: 'Přihlašovací služba Microsoft teď neodpovídá. Zkuste to prosím za chvíli.',
    'signout-failed':
      'Na tomto zařízení jste odhlášeni, ale odhlášení se nepodařilo zaznamenat. Pokud jste se chtěli odhlásit na všech zařízeních, přihlaste se a\u00A0zkuste to prosím znovu.',
  } as const satisfies Record<SignInError, string>,
  loggedOut: {
    here: 'Byli jste odhlášeni.',
    everywhere: 'Byli jste odhlášeni na všech zařízeních.',
    sharedComputer: 'Na sdíleném počítači se odhlaste i\u00A0z\u00A0Microsoft 365.',
  },
} as const;
