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
import {
  cancelFuture,
  createFuture,
  declineFutureReport,
  decideFuture,
  getFuture,
  listFuture,
  queueFuture,
  retractFuture,
  saveFuture,
  startFutureReport,
  submitFuture,
} from './future';
import { issueWindow, setSkipped } from './issues';
import { recentPeopleOf, searchGate } from './people';
import {
  createPoint,
  decidePoint,
  getPoint,
  listMyPoints,
  pointStatus,
  queuePoints,
  retractPoint,
  reviewEditPoint,
  savePoint,
  submitPoint,
  withdrawPoint,
} from './points';
import { listPointTypes, savePointType } from './point-types';
import { me, setReminders } from './profile';
import { previewPaste } from './registry';
import { readSettings, saveSettings } from './settings';
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
export {
  cancelFuture,
  createFuture,
  declineFutureReport,
  decideFuture,
  getFuture,
  listFuture,
  queueFuture,
  retractFuture,
  saveFuture,
  startFutureReport,
  submitFuture,
} from './future';
export { issueWindow, setSkipped } from './issues';
export { recentPeopleOf, searchGate } from './people';
export {
  createPoint,
  decidePoint,
  getPoint,
  listMyPoints,
  pointStatus,
  queuePoints,
  retractPoint,
  reviewEditPoint,
  savePoint,
  submitPoint,
  withdrawPoint,
} from './points';
export { listPointTypes, savePointType } from './point-types';
export { me, setReminders } from './profile';
export { previewPaste } from './registry';
export { readSettings, saveSettings } from './settings';
export { changeUserAccess, getUser, listUsers } from './users';

/**
 * Every use case of the app. The inventory test proves this list is
 * complete and that every server action wraps one of them.
 */
export const USE_CASES: readonly AnyUseCase[] = [
  beginLogin,
  beginStepUp,
  cancelAccess,
  cancelFuture,
  changeUserAccess,
  completeSignIn,
  createFuture,
  createPoint,
  decideAccess,
  decideFuture,
  declineFutureReport,
  decidePoint,
  getFuture,
  getPoint,
  getUser,
  issueWindow,
  listFuture,
  listMyPoints,
  listPointTypes,
  listUsers,
  me,
  myAccess,
  pendingAccess,
  pointStatus,
  previewPaste,
  queueFuture,
  queuePoints,
  readSettings,
  recentPeopleOf,
  recordRejection,
  requestAccess,
  resolveSession,
  retractFuture,
  retractPoint,
  reviewEditPoint,
  saveFuture,
  savePoint,
  savePointType,
  saveSettings,
  searchGate,
  setReminders,
  setSkipped,
  signOut,
  startFutureReport,
  submitFuture,
  submitPoint,
  takeSignIn,
  withdrawPoint,
];
