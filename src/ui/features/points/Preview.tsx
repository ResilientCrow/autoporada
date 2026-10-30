'use client';

import { useDeferredValue, useMemo } from 'react';

import { composePointPreview } from '@/document';
import { PaperBlocks } from '@/document/render-html';
import type { PointKind } from '@/domain/report';
import { points } from '@/ui/copy';

import { pointContentOf, type PointContentWire } from './fields';
import { previewNotices } from './preview-notice';

/**
 * The point as the document prints it, from the content the editor holds. It follows a
 * deferred copy of the content, so typing is never held up by composing. Without a title and
 * a start date there is nothing to show, and it says what is missing; otherwise a line under
 * the paper names what the preview left out. A proposal needs only its title. From the wide layout it scrolls inside itself when
 * taller than the screen, and takes focus so the keyboard can scroll it. Its h2 is for screen
 * readers only: alone on a phone, the paper's h3 would otherwise follow the page's h1.
 */
export function Preview({
  kind,
  content,
  schoolYear,
}: {
  readonly kind: PointKind;
  readonly content: PointContentWire;
  readonly schoolYear: string;
}) {
  const deferred = useDeferredValue(content);
  const { blocks, omitted } = useMemo(
    () => composePointPreview(pointContentOf(deferred), { schoolYear, kind }),
    [deferred, schoolYear, kind],
  );
  const notices = previewNotices(omitted);
  return (
    <section aria-labelledby="nahled" tabIndex={0} className="space-y-2 lg:pane-fit">
      <h2 id="nahled" className="sr-only">
        {points.preview.label}
      </h2>
      {blocks.length === 0 ? (
        <p>{kind === 'report' ? points.preview.empty : points.preview.emptyProposal}</p>
      ) : (
        <>
          <PaperBlocks blocks={blocks} />
          {notices.map((notice) => (
            <p key={notice}>{notice}</p>
          ))}
        </>
      )}
    </section>
  );
}
