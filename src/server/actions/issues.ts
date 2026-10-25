'use server';

import { setSkipped as setSkippedUseCase } from '@/application/use-cases';

import { defineAction } from '@/server/bind';

/** „Porada se nekoná“ and „Porada se koná“ on the Přehled; the page re-renders with the new status. */
export const setSkipped = defineAction(setSkippedUseCase, { rateLimit: 'admin' });
