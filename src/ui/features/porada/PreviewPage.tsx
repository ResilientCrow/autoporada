import type { DocumentModel } from '@/document';
import { PaperPreview } from '@/document/render-html';
import { porada } from '@/ui/copy';
import { ArrowLink, Notice, SlantLabel } from '@/ui/kit';

import { Preflight, type FindingView } from './Preflight';

/** The preview of one porada: the document as it would print and the preflight above it. */
export interface PreviewView {
  readonly monday: string;
  /** „pondělí 9. listopadu 2026“. */
  readonly meeting: string;
  /** The headmaster goes back to the workspace; a staff reviewer only reads. */
  readonly canEdit: boolean;
  /** Null when the snapshot is invalid. */
  readonly document: DocumentModel | null;
  readonly findings: readonly FindingView[];
}

/** „Náhled“: the preflight list, then the paper preview of the document. */
export function PreviewPage({ view }: { readonly view: PreviewView }) {
  return (
    <>
      <SlantLabel level={1}>{porada.preview.title}</SlantLabel>
      <div className="mt-4 space-y-8">
        <p>{porada.meeting(view.meeting)}</p>
        {view.canEdit && (
          <p>
            <ArrowLink href={`/porada/${view.monday}`}>{porada.preview.back}</ArrowLink>
          </p>
        )}
        <Preflight findings={view.findings} />
        <section aria-labelledby="nahled-dokumentu" className="space-y-2">
          <h2 id="nahled-dokumentu" className="text-xl">
            {porada.preview.paper}
          </h2>
          {view.document === null ? (
            <Notice tone="problem" live={false}>
              {porada.preview.invalid}
            </Notice>
          ) : (
            <PaperPreview model={view.document} label={porada.preview.paper} />
          )}
        </section>
      </div>
    </>
  );
}
