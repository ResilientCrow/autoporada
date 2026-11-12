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
  decideFuture,
  getFuture,
  listFuture,
  owedReports,
  queueFuture,
  retractFuture,
  saveFuture,
  startFutureReport,
  submitFuture,
  withdrawFuture,
} from './future';
import { documentArchive, downloadDocument } from './documents';
import {
  addIssue,
  confirmPlaceholder,
  dropIssue,
  generateIssue,
  issueMissingReports,
  issuePreview,
  issueWindow,
  issueWorkspace,
  moveIssue,
  readIssueTexts,
  reportTally,
  setIssueAnnex2,
  setIssueDetails,
  setPlaceholder,
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
import { deletePointType, listPointTypes, savePointType } from './point-types';
import { me } from './profile';
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
  decideFuture,
  getFuture,
  listFuture,
  owedReports,
  queueFuture,
  retractFuture,
  saveFuture,
  startFutureReport,
  submitFuture,
  withdrawFuture,
} from './future';
export { documentArchive, downloadDocument } from './documents';
export {
  addIssue,
  confirmPlaceholder,
  dropIssue,
  generateIssue,
  issueMissingReports,
  issuePreview,
  issueWindow,
  issueWorkspace,
  moveIssue,
  readIssueTexts,
  reportTally,
  setIssueAnnex2,
  setIssueDetails,
  setPlaceholder,
  systemParagraph,
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
export { deletePointType, listPointTypes, savePointType } from './point-types';
export { me } from './profile';
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
  addIssue,
  addOutlineItem,
  beginLogin,
  beginStepUp,
  cancelAccess,
  cancelFuture,
  changeUserAccess,
  completeSignIn,
  confirmPlaceholder,
  createFuture,
  createPoint,
  decideAccess,
  decideFuture,
  decidePoint,
  deletePointType,
  documentArchive,
  dropIssue,
  downloadDocument,
  getFuture,
  getPoint,
  generateIssue,
  getUser,
  issueMissingReports,
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
  owedReports,
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
  reportTally,
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
  setIssueAnnex2,
  setIssueDetails,
  setPlaceholder,
  signOut,
  startFutureReport,
  submitFuture,
  submitPoint,
  takeSignIn,
  withdrawFuture,
  withdrawPoint,
];
