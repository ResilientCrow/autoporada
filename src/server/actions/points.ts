'use server';

import { createPoint as createPointUseCase } from '@/application/use-cases';

import { defineAction } from '@/server/bind';

/**
 * „Začít“ on /body/novy. It does not refresh: the chooser's client replaces the
 * route with the new draft itself (ADR 0017 item 1), and a retry with the same
 * `clientRef` returns the same draft.
 */
export const createPoint = defineAction(createPointUseCase, {
  rateLimit: 'submission',
  refresh: 'none',
});
