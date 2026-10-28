'use server';

import { decidePoint as decidePointUseCase } from '@/application/use-cases';

import { defineAction } from '@/server/bind';

/**
 * The decision bar on /kontrola/[id]: approve, return or reject. It moves the state, so it
 * refreshes the page; „Schválit a pokračovat“ then opens the next point the answer names (ADR 0025).
 */
export const decidePoint = defineAction(decidePointUseCase, { rateLimit: 'admin' });
