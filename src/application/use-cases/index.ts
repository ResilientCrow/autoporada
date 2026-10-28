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
import { recentPeopleOf, searchGate } from './people';
import {
  createPoint,
  getPoint,
  listMyPoints,
  pointStatus,
  queuePoints,
  retractPoint,
  savePoint,
  submitPoint,
  withdrawPoint,
} from './points';
import { listPointTypes } from './point-types';
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
export { recentPeopleOf, searchGate } from './people';
export {
  createPoint,
  getPoint,
  listMyPoints,
  pointStatus,
  queuePoints,
  retractPoint,
  savePoint,
  submitPoint,
  withdrawPoint,
} from './points';
export { listPointTypes } from './point-types';
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
  getPoint,
  getUser,
  issueWindow,
  listMyPoints,
  listPointTypes,
  listUsers,
  me,
  myAccess,
  pendingAccess,
  pointStatus,
  queuePoints,
  recentPeopleOf,
  recordRejection,
  requestAccess,
  resolveSession,
  retractPoint,
  savePoint,
  searchGate,
  setSkipped,
  signOut,
  submitPoint,
  takeSignIn,
  withdrawPoint,
];
