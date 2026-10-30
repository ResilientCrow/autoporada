import type { Salutation } from '@/domain/cs';
import type { PointContent, PointKind } from '@/domain/report';
import { singleLine } from '@/domain/richtext';

import type { Block } from '../model';
import { reportBlocks, reportFromContent, type Omitted } from './report';
import { point, richBlocks } from './text';

const NOTHING_OMITTED: Omitted = { people: 0, peopleBullets: 0, textBullets: 0, statements: 0 };

/**
 * The live preview of one point: its blocks as the document prints them, numbered
 * 1 (numberPoints stays private to composeDocument), and what was left out. Without
 * a title (and, for a report, a start date) there is nothing to show and `blocks` is
 * empty. A finance or pokyn proposal is the title and its text, like the HOSPODAŘENÍ
 * and POKYNY points of the document (M9 copies it there); it leaves nothing out.
 */
export function composePointPreview(
  content: PointContent,
  opts: { schoolYear: string; kind?: PointKind; groupOrder?: readonly Salutation[] },
): { blocks: Block[]; omitted: Omitted } {
  if (opts.kind !== undefined && opts.kind !== 'report') {
    const title = singleLine(content.title);
    const blocks =
      title === ''
        ? []
        : point(title, richBlocks(content.body, { skolniRok: opts.schoolYear })).map((b) =>
            b.kind === 'point' ? { ...b, number: 1 } : b,
          );
    return { blocks, omitted: NOTHING_OMITTED };
  }
  const { report, omitted } = reportFromContent(content, { id: 'preview' });
  if (!report) return { blocks: [], omitted };
  const blocks = reportBlocks(report, {
    ...(opts.groupOrder && { groupOrder: opts.groupOrder }),
    tokens: { skolniRok: opts.schoolYear },
  }).map((b) => (b.kind === 'point' ? { ...b, number: 1 } : b));
  return { blocks, omitted };
}
