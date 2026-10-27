import type { Salutation } from '@/domain/cs';
import type { PointContent } from '@/domain/report';

import type { Block } from '../model';
import { reportBlocks, reportFromContent, type Omitted } from './report';

/**
 * The live preview of one point: its blocks as the document prints them, numbered
 * 1 (numberPoints stays private to composeDocument), and what was left out. Without
 * a title or a start date there is nothing to show and `blocks` is empty.
 */
export function composePointPreview(
  content: PointContent,
  opts: { schoolYear: string; groupOrder?: readonly Salutation[] },
): { blocks: Block[]; omitted: Omitted } {
  const { report, omitted } = reportFromContent(content, { id: 'preview' });
  if (!report) return { blocks: [], omitted };
  const blocks = reportBlocks(report, {
    ...(opts.groupOrder && { groupOrder: opts.groupOrder }),
    tokens: { skolniRok: opts.schoolYear },
  }).map((b) => (b.kind === 'point' ? { ...b, number: 1 } : b));
  return { blocks, omitted };
}
