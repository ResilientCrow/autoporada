'use server';

import {
  generateIssue as generateIssueUseCase,
  moveIssue as moveIssueUseCase,
  setIssueAnnex2 as setIssueAnnex2UseCase,
  setIssueDetails as setIssueDetailsUseCase,
  setSkipped as setSkippedUseCase,
} from '@/application/use-cases';

import { defineAction } from '@/server/bind';

/** „Porada se nekoná“ and „Porada se koná“ on the Přehled; the page re-renders with the new status. */
export const setSkipped = defineAction(setSkippedUseCase, { rateLimit: 'admin' });

/** „Uložit“ on Údaje: Přítomni and Hosté, both sent whole. */
export const setIssueDetails = defineAction(setIssueDetailsUseCase, { rateLimit: 'admin' });

/** „Uložit“ and „Odebrat přílohu“ on Příloha 2; removing sends an empty document. */
export const setIssueAnnex2 = defineAction(setIssueAnnex2UseCase, { rateLimit: 'admin' });

/** „Přesunout poradu“: a new meeting date with its deadline; the slots in the way are cancelled with it. */
export const moveIssue = defineAction(moveIssueUseCase, { rateLimit: 'admin' });

/** „Vygenerovat dokument“ on the Náhled: the DOCX is stored and the PDF queued (ADR 0038). */
export const generateIssue = defineAction(generateIssueUseCase, { rateLimit: 'admin' });
