export const app = {
  name: 'Autoporada',
  description: 'Podklady pro poradu vedení Smíchovské střední',
  /** Development's technical line under a failure (ADR 0044). */
  technical: 'Technicky:',
} as const;

/** The page for an address that does not exist; the wording is the Arch UI's own `NotFound`. */
export const notFound = {
  title: 'Tenhle list tu není',
  text: 'Odkaz je starý, nebo k\u00a0němu nemáte přístup. Váš přehled je na stejném místě jako vždy.',
  home: 'Domů',
} as const;

export const appError = {
  title: 'Něco se nepovedlo',
  retry: 'Zkusit znovu',
} as const;
