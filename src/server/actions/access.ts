'use server';

import {
  cancelAccess as cancelAccessUseCase,
  decideAccess as decideAccessUseCase,
  requestAccess as requestAccessUseCase,
} from '@/application/use-cases';

import { defineAction } from '@/server/bind';

/** „Odeslat žádost“. Three a day per user, which also bounds the cancels. */
export const requestAccess = defineAction(requestAccessUseCase, { rateLimit: 'accessRequest' });

/** „Zrušit žádost“: it needs a pending request, so the limit above already bounds it (ADR 0014). */
export const cancelAccess = defineAction(cancelAccessUseCase, { rateLimit: 'none' });

/** The queue's buttons: approve as staff or student, or reject. */
export const decideAccess = defineAction(decideAccessUseCase, { rateLimit: 'admin' });
