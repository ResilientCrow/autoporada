'use client';

import { useDeferredValue, useMemo } from 'react';

import { composePointPreview } from '@/document';
import { PaperBlocks } from '@/document/render-html';
import { points } from '@/ui/copy';

import { pointContentOf, type PointContentWire } from './fields';
import { previewNotices } from './preview-notice';

/**
 * The point as the document prints it, from the content the editor holds. It follows a
 * deferred copy of the content, so typing is never held up by composing. Without a title and
 * a start date there is nothing to show, and it says what is missing; otherwise a line under
 * the paper names what the preview left out. From the wide layout it scrolls inside itself when
 * taller than the screen, and takes focus so the keyboard can scroll it.
 */
export function Preview({
  content,
  schoolYear,
}: {
  readonly content: PointContentWire;
  readonly schoolYear: string;
}) {
  const deferred = useDeferredValue(content);
  const { blocks, omitted } = useMemo(
    () => composePointPreview(pointContentOf(deferred), { schoolYear }),
    [deferred, schoolYear],
  );
  const notices = previewNotices(omitted);
  return (
    <section aria-label={points.preview.label} tabIndex={0} className="space-y-2 lg:pane-fit">
      {blocks.length === 0 ? (
        <p>{points.preview.empty}</p>
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
