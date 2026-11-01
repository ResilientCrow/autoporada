export const app = {
  name: 'Autoporada',
  description: 'Podklady pro poradu vedení Smíchovské střední',
  /** Development's technical line under a failure (ADR 0044). */
  technical: 'Technicky:',
} as const;

export const notFound = {
  title: 'Stránka nenalezena',
  text: 'Tato stránka neexistuje, nebo k\u00A0ní nemáte přístup.',
  home: 'Přejít na úvodní stránku',
} as const;

export const appError = {
  title: 'Něco se nepovedlo',
  retry: 'Zkusit znovu',
} as const;

export const home = {
  title: 'Přehled',
  pending: 'Zatím nemáte přístup k\u00A0podkladům porady.',
  access: 'Přístup',
  request: 'Požádat o\u00A0přístup',
  showRequest: 'Zobrazit žádost',
  account: 'Váš účet',
  signOutEverywhere: 'Odhlásit všude',
} as const;
