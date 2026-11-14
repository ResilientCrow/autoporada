import type { FailureCause, SignInError } from '@/contracts';

import { failures } from './failures';

const FAILED = 'Přihlášení se nepodařilo.';
const TELL_ADMIN = 'Dejte to prosím vědět správci.';

/** Each failure cause after „Přihlášení se nepodařilo.“ (ADR 0044). */
const failedBecause = Object.fromEntries(
  Object.entries(failures).map(([cause, text]) => [cause, `${FAILED} ${text}`]),
) as Record<FailureCause, string>;

export const signIn = {
  title: 'Přihlášení',
  intro: 'Přihlaste se svým školním účtem Microsoft.',
  data: 'Při přihlášení si Autoporada uloží Vaše jméno, e-mail a\u00A0zařazení ve\u00A0škole.',
  privacyLink: 'Jak s\u00A0údaji zacházíme',
  accounts: 'Účty hostů a\u00A0soukromé účty Microsoft nefungují.',
  button: 'Přihlásit se školním účtem',
  redirect: 'Přesměrujeme Vás na\u00A0přihlašovací stránku Microsoftu a\u00A0zpět.',
  switchAccount: 'Přihlásit se jiným účtem',
  errors: {
    expired: 'Přihlášení vypršelo nebo už bylo použito. Přihlaste se prosím znovu.',
    cancelled: 'Přihlášení bylo zrušeno.',
    'not-member':
      'Přihlásit se lze jen školním účtem Microsoft. Účty hostů a\u00A0jiných organizací povoleny nejsou.',
    blocked: 'Váš účet je v\u00A0Autoporadě zablokovaný. Obraťte se prosím na vedení školy.',
    'step-up-mismatch': 'Ověřte se prosím stejným účtem, kterým jste přihlášeni.',
    'step-up-stale': 'Ověření se nepodařilo dokončit. Při přihlášení prosím znovu zadejte heslo.',
    unavailable: 'Přihlašovací služba Microsoftu teď neodpovídá. Zkuste to prosím za chvíli.',
    'idp-refused': `Microsoft přihlášení odmítl. ${TELL_ADMIN}`,
    'idp-invalid':
      'Odpověď přihlašovací služby Microsoftu se nedala ověřit. Zkuste to prosím znovu; pokud potíže trvají, dejte to prosím vědět správci.',
    claims: `Microsoft neposlal údaje, které aplikace potřebuje (jméno nebo e-mail). ${TELL_ADMIN}`,
    'signout-failed':
      'Na tomto zařízení jste odhlášeni, ale odhlášení se nepodařilo zaznamenat. Pokud jste se chtěli odhlásit na všech zařízeních, přihlaste se a\u00A0zkuste to prosím znovu.',
    ...failedBecause,
  } as const satisfies Record<SignInError, string>,
  /** `idp-refused` with Entra's error number, e.g. AADSTS50011. */
  refusedWithCode: (aadsts: string) => `Microsoft přihlášení odmítl (kód ${aadsts}). ${TELL_ADMIN}`,
  loggedOut: {
    here: 'Byli jste odhlášeni.',
    everywhere: 'Byli jste odhlášeni na všech zařízeních.',
    sharedComputer:
      'Na sdíleném počítači se odhlaste i\u00A0ze\u00A0svého školního účtu Microsoft.',
  },
} as const;
