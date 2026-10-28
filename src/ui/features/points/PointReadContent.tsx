import { composePointPreview } from '@/document';
import { PaperBlocks } from '@/document/render-html';
import type { PointKind } from '@/domain/report';

import { points } from '@/ui/copy';

import { pointContentOf, type PointContentWire } from './fields';

/**
 * The point as the document prints it, for the read view: the opening, the paragraphs, the bullets and
 * the statements, composed the way the editor's preview composes them, so the two never disagree.
 * Only a report has this layout until proposals get theirs (M8b); nothing for a point the preview
 * cannot compose (no title or start date).
 */
export function PointReadContent({
  kind,
  content,
  schoolYear,
}: {
  readonly kind: PointKind;
  readonly content: PointContentWire;
  readonly schoolYear: string;
}) {
  if (kind !== 'report') return null;
  const { blocks } = composePointPreview(pointContentOf(content), { schoolYear });
  if (blocks.length === 0) return null;
  return (
    <section aria-labelledby="bod-zneni" className="space-y-2">
      {/* The paper's point heading is an h3: without this h2 above it the page would skip a level. */}
      <h2 id="bod-zneni" className="text-xl">
        {points.read.label}
      </h2>
      <PaperBlocks blocks={blocks} />
    </section>
  );
}
