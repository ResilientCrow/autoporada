'use server';

import {
  decidePoint as decidePointUseCase,
  reviewEditPoint as reviewEditPointUseCase,
} from '@/application/use-cases';

import { defineAction } from '@/server/bind';

/**
 * The decision bar on /kontrola/[id]: approve, return or reject. It moves the state, so it
 * refreshes the page; „Schválit a pokračovat“ then opens the next point the answer names (ADR 0025).
 */
export const decidePoint = defineAction(decidePointUseCase, { rateLimit: 'admin' });

/**
 * „Uložit úpravy“ of a reviewer on /kontrola/[id]: an explicit, audited save, so the page refreshes
 * and the timeline shows the edit. It never navigates.
 */
export const reviewEditPoint = defineAction(reviewEditPointUseCase, {
  rateLimit: 'admin',
  refresh: 'page',
});
