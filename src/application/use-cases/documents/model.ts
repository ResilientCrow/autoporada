import { composeDocument, type DocumentModel } from '@/document';
import type { IssueSnapshot } from '@/snapshot';

/** How many points the archive shelf shows of a document. */
const TITLES_SHOWN = 3;

/** A stored document as the archive reads it. */
export interface ArchivedModel {
  readonly model: DocumentModel;
  /** The numbered points of the model. */
  readonly points: number;
  /** The texts of the last points, in document order. */
  readonly titles: readonly string[];
}

/**
 * The one step from a stored snapshot to what the archive reads: the composed model, how many
 * points it holds and the texts of its last few. The snapshot was parsed before it was stored and
 * again when the port read it, so there is nothing to refuse here.
 */
export function archivedModel(snapshot: IssueSnapshot): ArchivedModel {
  const model = composeDocument(snapshot);
  const texts = model.sections
    .flatMap((section) => section.blocks)
    .flatMap((block) => (block.kind === 'point' ? [block.text] : []));
  return { model, points: texts.length, titles: texts.slice(-TITLES_SHOWN) };
}
