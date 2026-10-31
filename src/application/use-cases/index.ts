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
import { documentArchive, downloadDocument } from './documents';
import {
  generateIssue,
  issuePreview,
  issueWindow,
  issueWorkspace,
  moveIssue,
  readIssueTexts,
  setIssueAnnex2,
  setIssueDetails,
  setSkipped,
} from './issues';
import {
  addOutlineItem,
  moveOutlineItem,
  readOutline,
  readOutlineItem,
  removeOutlineItem,
  saveOutlineItem,
} from './outline';
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
import {
  addEntries,
  moveList,
  newSchoolYear,
  previewPaste,
  readRegistry,
  removeEntry,
  saveEntry,
  saveList,
} from './registry';
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
export { documentArchive, downloadDocument } from './documents';
export {
  generateIssue,
  issuePreview,
  issueWindow,
  issueWorkspace,
  moveIssue,
  readIssueTexts,
  setIssueAnnex2,
  setIssueDetails,
  setSkipped,
} from './issues';
export {
  addOutlineItem,
  moveOutlineItem,
  readOutline,
  readOutlineItem,
  removeOutlineItem,
  saveOutlineItem,
} from './outline';
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
export {
  addEntries,
  moveList,
  newSchoolYear,
  previewPaste,
  readRegistry,
  removeEntry,
  saveEntry,
  saveList,
} from './registry';
export { readSettings, saveSettings } from './settings';
export { changeUserAccess, getUser, listUsers } from './users';

/**
 * Every use case of the app. The inventory test proves this list is
 * complete and that every server action wraps one of them.
 */
export const USE_CASES: readonly AnyUseCase[] = [
  addEntries,
  addOutlineItem,
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
  documentArchive,
  downloadDocument,
  getFuture,
  getPoint,
  generateIssue,
  getUser,
  issuePreview,
  issueWindow,
  issueWorkspace,
  listFuture,
  listMyPoints,
  listPointTypes,
  listUsers,
  me,
  moveIssue,
  moveList,
  moveOutlineItem,
  myAccess,
  newSchoolYear,
  pendingAccess,
  pointStatus,
  previewPaste,
  queueFuture,
  queuePoints,
  readIssueTexts,
  readOutline,
  readOutlineItem,
  readRegistry,
  readSettings,
  recentPeopleOf,
  recordRejection,
  removeEntry,
  removeOutlineItem,
  requestAccess,
  resolveSession,
  retractFuture,
  retractPoint,
  reviewEditPoint,
  saveEntry,
  saveFuture,
  saveList,
  saveOutlineItem,
  savePoint,
  savePointType,
  saveSettings,
  searchGate,
  setReminders,
  setIssueAnnex2,
  setIssueDetails,
  setSkipped,
  signOut,
  startFutureReport,
  submitFuture,
  submitPoint,
  takeSignIn,
  withdrawPoint,
];
