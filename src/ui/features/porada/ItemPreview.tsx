'use client';

import { useDeferredValue, useMemo } from 'react';

import { composeItemPreview } from '@/document';
import { PaperBlocks } from '@/document/render-html';
import type { SystemSlot } from '@/domain/outline';
import type { RichDoc } from '@/domain/richtext';
import { porada } from '@/ui/copy';

import { statementOf, type QuoteDraft } from './item-editor';

/**
 * The item as the document prints it, from what the editor holds. It follows a deferred copy, so typing
 * is never held up by composing. Its h2 is for screen readers only: the paper's own h3 follows the
 * page's h1 otherwise. Taller than the screen, it scrolls inside itself and takes focus for the keyboard.
 */
export function ItemPreview({
  title,
  slot,
  body,
  quotes,
  schoolYear,
}: {
  readonly title: string;
  readonly slot: SystemSlot | null;
  readonly body: RichDoc;
  readonly quotes: readonly QuoteDraft[];
  readonly schoolYear: string;
}) {
  const deferred = useDeferredValue({ title, body, quotes });
  const blocks = useMemo(
    () =>
      composeItemPreview(
        {
          title: deferred.title,
          slot,
          body: deferred.body,
          quotes: deferred.quotes.map(statementOf),
        },
        { schoolYear },
      ),
    [deferred, slot, schoolYear],
  );
  const { editor } = porada.outline;
  return (
    <section aria-labelledby="nahled-bodu" tabIndex={0} className="space-y-2 lg:pane-fit">
      <h2 id="nahled-bodu" className="sr-only">
        {editor.previewLabel}
      </h2>
      {blocks.length === 0 ? <p>{editor.previewEmpty}</p> : <PaperBlocks blocks={blocks} />}
    </section>
  );
}
