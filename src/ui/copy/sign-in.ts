import type { SignInError } from '@/contracts';

export const signIn = {
  title: 'Přihlášení',
  intro: 'Přihlaste se svým školním účtem Microsoft.',
  data: 'Při přihlášení si Autoporada uloží vaše jméno, e-mail a\u00A0zařazení ve\u00A0škole.',
  privacyLink: 'Jak s\u00A0údaji zacházíme',
  accounts: 'Účty hostů a\u00A0soukromé účty Microsoft nefungují.',
  button: 'Přihlásit se školním účtem',
  redirect: 'Přesměrujeme vás na\u00A0přihlašovací stránku Microsoftu a\u00A0zpět.',
  switchAccount: 'Přihlásit se jiným účtem',
  errors: {
    expired: 'Přihlášení vypršelo nebo už bylo použito. Přihlaste se prosím znovu.',
    cancelled: 'Přihlášení bylo zrušeno.',
    'not-member':
      'Přihlásit se lze jen školním účtem Microsoft. Účty hostů a\u00A0jiných organizací povoleny nejsou.',
    blocked: 'Váš účet je v\u00A0Autoporadě zablokovaný. Obraťte se prosím na vedení školy.',
    'step-up-mismatch': 'Ověřte se prosím stejným účtem, kterým jste přihlášeni.',
    'step-up-stale': 'Ověření se nepodařilo dokončit. Při přihlášení prosím znovu zadejte heslo.',
    failed:
      'Přihlášení se nepodařilo. Zkuste to prosím znovu; pokud potíže trvají, pošlete správci kód chyby.',
    unavailable: 'Přihlašovací služba Microsoftu teď neodpovídá. Zkuste to prosím za chvíli.',
    'signout-failed':
      'Na tomto zařízení jste odhlášeni, ale odhlášení se nepodařilo zaznamenat. Pokud jste se chtěli odhlásit na všech zařízeních, přihlaste se a\u00A0zkuste to prosím znovu.',
  } as const satisfies Record<SignInError, string>,
  loggedOut: {
    here: 'Byli jste odhlášeni.',
    everywhere: 'Byli jste odhlášeni na všech zařízeních.',
    sharedComputer:
      'Na sdíleném počítači se odhlaste i\u00A0ze\u00A0svého školního účtu Microsoft.',
  },
} as const;
