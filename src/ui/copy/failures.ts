import type { FailureCause } from '@/contracts';

/**
 * What broke, in words (ADR 0044): the sentence a failed form or page shows for its cause.
 * Each says what to do, and none carries a code.
 */
export const failures = {
  'database-down': 'Databáze aplikace teď neodpovídá. Zkuste to prosím za chvíli.',
  timeout: 'Server nestihl odpovědět včas. Zkuste to prosím znovu.',
  'database-setup':
    'Databáze aplikace není správně nastavená (chybí úprava databáze nebo oprávnění). Dejte to prosím vědět správci.',
  'stored-data':
    'Uložená data jsou v\u00A0neočekávaném stavu a\u00A0aplikace je neumí přečíst. Dejte to prosím vědět správci.',
  bug: 'V\u00A0aplikaci nastala neočekávaná chyba. Dejte to prosím vědět správci.',
} as const satisfies Record<FailureCause, string>;
