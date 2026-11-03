/** Browser-safe entry: composing and previewing. The DOCX renderer is server-only (render-docx/). */
// reportFromContent is also M9's snapshot builder: for a submitted point every count is zero and report is never null.
export {
  composeDocument,
  composeItemPreview,
  composePointPreview,
  MISSING_REPORT_LINES,
  reportFromContent,
  snapshotPerson,
  type Omitted,
} from './compose';
export type { Block, BlockKind, DocumentModel, Run, Section, StudentRow } from './model';
