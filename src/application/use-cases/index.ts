import type { AnyUseCase } from '@/application/core';

import { cancelAccess, decideAccess, myAccess, pendingAccess, requestAccess } from './access';
import {
  beginLogin,
  beginStepUp,
  completeSignIn,
  recordRejection,
  resolveSession,
  signOut,
  takeSignIn,
} from './auth';
import { issueWindow, setSkipped } from './issues';
import { createPoint, retractPoint, savePoint, submitPoint, withdrawPoint } from './points';
import { me } from './profile';
import { changeUserAccess, getUser, listUsers } from './users';

export { cancelAccess, decideAccess, myAccess, pendingAccess, requestAccess } from './access';
export {
  beginLogin,
  beginStepUp,
  completeSignIn,
  recordRejection,
  resolveSession,
  signOut,
  takeSignIn,
} from './auth';
export { issueWindow, setSkipped } from './issues';
export { createPoint, retractPoint, savePoint, submitPoint, withdrawPoint } from './points';
export { me } from './profile';
export { changeUserAccess, getUser, listUsers } from './users';

/**
 * Every use case of the app. The inventory test proves this list is
 * complete and that every server action wraps one of them.
 */
export const USE_CASES: readonly AnyUseCase[] = [
  beginLogin,
  beginStepUp,
  cancelAccess,
  changeUserAccess,
  completeSignIn,
  createPoint,
  decideAccess,
  getUser,
  issueWindow,
  listUsers,
  me,
  myAccess,
  pendingAccess,
  recordRejection,
  requestAccess,
  resolveSession,
  retractPoint,
  savePoint,
  setSkipped,
  signOut,
  submitPoint,
  takeSignIn,
  withdrawPoint,
];
