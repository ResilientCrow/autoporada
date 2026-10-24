import type { AnyUseCase } from '@/application/core';

import { requestAccess } from './access';
import {
  beginLogin,
  beginStepUp,
  completeSignIn,
  recordRejection,
  resolveSession,
  signOut,
  takeSignIn,
} from './auth';
import { me } from './profile';

export { requestAccess } from './access';
export {
  beginLogin,
  beginStepUp,
  completeSignIn,
  recordRejection,
  resolveSession,
  signOut,
  takeSignIn,
} from './auth';
export { me } from './profile';

/**
 * Every use case of the app. The inventory test proves this list is
 * complete and that every server action wraps one of them.
 */
export const USE_CASES: readonly AnyUseCase[] = [
  beginLogin,
  beginStepUp,
  completeSignIn,
  me,
  recordRejection,
  requestAccess,
  resolveSession,
  signOut,
  takeSignIn,
];
