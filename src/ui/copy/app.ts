export const app = {
  name: 'Autoporada',
  description: 'Podklady pro poradu vedení Smíchovské střední',
  errorCode: 'Kód chyby:',
} as const;

export const notFound = {
  title: 'Stránka nenalezena',
  text: 'Tato stránka neexistuje, nebo k\u00A0ní nemáte přístup.',
  home: 'Přejít na úvodní stránku',
} as const;

export const appError = {
  title: 'Něco se nepovedlo',
  text: 'Stránku se nepodařilo zobrazit. Zkuste to prosím znovu; pokud potíže trvají, obraťte se na vedení školy.',
  retry: 'Zkusit znovu',
} as const;

export const home = {
  signedInAs: 'Přihlášen(a):',
  pending: 'Váš účet čeká na schválení vedením školy.',
  signOut: 'Odhlásit se',
  signOutEverywhere: 'Odhlásit všude',
} as const;
