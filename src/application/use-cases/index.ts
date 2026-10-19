import type { AnyUseCase } from '@/application/core';

import { beginLogin, beginStepUp, completeSignIn, recordRejection, takeSignIn } from './auth';

export { beginLogin, beginStepUp, completeSignIn, recordRejection, takeSignIn } from './auth';

/**
 * Every use case of the app. The inventory test proves this list is
 * complete and that every server action wraps one of them.
 */
export const USE_CASES: readonly AnyUseCase[] = [
  beginLogin,
  beginStepUp,
  completeSignIn,
  recordRejection,
  takeSignIn,
];
