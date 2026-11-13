import type { AnyUseCase } from '@/application/core';

import { cancelAccess, decideAccess, requestAccess } from './access';
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
  refuseCancelFuture,
  requestCancelFuture,
  retractCancelFuture,
  retractFuture,
  saveFuture,
  startFutureReport,
  submitFuture,
  withdrawFuture,
} from './future';
import { downloadDocument } from './documents';
import {
  addIssue,
  confirmPlaceholder,
  dropIssue,
  generateIssue,
  issueMissingReports,
  moveIssue,
  readIssueTexts,
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
import { searchGate } from './people';
import {
  createPoint,
  decidePoint,
  retractPoint,
  reviewEditPoint,
  savePoint,
  submitPoint,
  withdrawPoint,
} from './points';
import {
  addEntries,
  newSchoolYear,
  readRegistry,
  removeEntry,
  saveEntry,
  saveList,
} from './registry';
import { saveSettings } from './settings';
import { changeUserAccess } from './users';

export { cancelAccess, decideAccess, requestAccess } from './access';
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
  refuseCancelFuture,
  requestCancelFuture,
  retractCancelFuture,
  retractFuture,
  saveFuture,
  startFutureReport,
  submitFuture,
  withdrawFuture,
} from './future';
export { downloadDocument } from './documents';
export {
  addIssue,
  confirmPlaceholder,
  dropIssue,
  generateIssue,
  issueMissingReports,
  moveIssue,
  readIssueTexts,
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
export { searchGate } from './people';
export {
  createPoint,
  decidePoint,
  retractPoint,
  reviewEditPoint,
  savePoint,
  submitPoint,
  withdrawPoint,
} from './points';
export {
  addEntries,
  newSchoolYear,
  readRegistry,
  removeEntry,
  saveEntry,
  saveList,
} from './registry';
export { saveSettings } from './settings';
export { changeUserAccess } from './users';

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
  dropIssue,
  downloadDocument,
  generateIssue,
  issueMissingReports,
  moveIssue,
  moveOutlineItem,
  newSchoolYear,
  readIssueTexts,
  readOutline,
  readOutlineItem,
  readRegistry,
  recordRejection,
  refuseCancelFuture,
  removeEntry,
  removeOutlineItem,
  requestAccess,
  requestCancelFuture,
  resolveSession,
  retractCancelFuture,
  retractFuture,
  retractPoint,
  reviewEditPoint,
  saveEntry,
  saveFuture,
  saveList,
  saveOutlineItem,
  savePoint,
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
