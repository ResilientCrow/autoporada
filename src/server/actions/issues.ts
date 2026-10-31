'use server';

import {
  moveIssue as moveIssueUseCase,
  setSkipped as setSkippedUseCase,
} from '@/application/use-cases';

import { defineAction } from '@/server/bind';

/** „Porada se nekoná“ and „Porada se koná“ on the Přehled; the page re-renders with the new status. */
export const setSkipped = defineAction(setSkippedUseCase, { rateLimit: 'admin' });

/** „Přesunout poradu“: a new meeting date with its deadline; the slots in the way are cancelled with it. */
export const moveIssue = defineAction(moveIssueUseCase, { rateLimit: 'admin' });
