'use server';

import {
  addIssue as addIssueUseCase,
  dropIssue as dropIssueUseCase,
  generateIssue as generateIssueUseCase,
  moveIssue as moveIssueUseCase,
  setIssueAnnex2 as setIssueAnnex2UseCase,
  setIssueDetails as setIssueDetailsUseCase,
  setPlaceholder as setPlaceholderUseCase,
} from '@/application/use-cases';

import { defineAction } from '@/server/bind';

/** „Přesunout poradu“: the porada keeps its Monday and takes a new meeting date (ADR 0054). */
export const moveIssue = defineAction(moveIssueUseCase, { rateLimit: 'admin' });

/** „Porada se nekoná“: the porada is removed and its content passes to the next one (ADR 0054). */
export const dropIssue = defineAction(dropIssueUseCase, { rateLimit: 'admin' });

/** „Přidat poradu“: a porada on a day the calendar has none (ADR 0054). */
export const addIssue = defineAction(addIssueUseCase, { rateLimit: 'admin' });

/** „Uložit“ on Údaje: Přítomni and Hosté, both sent whole. */
export const setIssueDetails = defineAction(setIssueDetailsUseCase, { rateLimit: 'admin' });

/** „Uložit“ and „Odebrat přílohu“ on Příloha 2; removing sends an empty document. */
export const setIssueAnnex2 = defineAction(setIssueAnnex2UseCase, { rateLimit: 'admin' });

/**
 * „Uložit“ and „Obnovit původní text“ on Chybějící zprávy: the paragraph printed for an akce whose
 * report is missing (ADR 0049). Not an autosave, so it refreshes the page.
 */
export const setPlaceholder = defineAction(setPlaceholderUseCase, { rateLimit: 'admin' });

/** „Vygenerovat dokument“ on the Náhled: the DOCX is stored and the PDF queued (ADR 0038). */
export const generateIssue = defineAction(generateIssueUseCase, { rateLimit: 'admin' });
