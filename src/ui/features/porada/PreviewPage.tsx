import type { DocumentModel } from '@/document';
import { PaperPreview } from '@/document/render-html';
import { porada } from '@/ui/copy';
import { ArrowLink, Notice, SlantLabel } from '@/ui/kit';

import { DocumentCard, type GeneratedView } from './DocumentCard';
import { GenerateForm, type GenerateAction, type GenerateView } from './GenerateForm';
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
  /** The headmaster's form for an open porada; null otherwise. */
  readonly generate: GenerateView | null;
  /** A generated porada: its document, previewed as it was generated. */
  readonly generated: GeneratedView | null;
}

/**
 * „Náhled“: the preflight list and the generate form, then the paper preview of the document. A
 * generated porada shows its files instead, and the paper is what was generated.
 */
export function PreviewPage({
  view,
  generate,
}: {
  readonly view: PreviewView;
  readonly generate: GenerateAction;
}) {
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
        {view.generated === null ? (
          <Preflight findings={view.findings} />
        ) : (
          <DocumentCard view={view.generated} />
        )}
        {view.generate !== null && (
          <GenerateForm key={view.generate.version} action={generate} view={view.generate} />
        )}
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
