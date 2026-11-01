import type { PdfFailure } from '@/contracts';
import { porada } from '@/ui/copy';
import { Card, DownloadLink } from '@/ui/kit';

/** A generated document as the workspace, the preview and the archive show it; dates arrive written. */
export interface GeneratedView {
  readonly monday: string;
  /** „31. 10. 2026“ and „14:05“. */
  readonly date: string;
  readonly time: string;
  readonly pdf: 'pending' | 'ready' | 'failed';
  /** Why the PDF failed; null unless it did, and for a failure from before the reason was kept. */
  readonly pdfFailure: PdfFailure | null;
}

/** The PDF's place while there is no file: still being made, or why not, then the DOCX to fall back on. */
function pdfNote(view: GeneratedView): string {
  if (view.pdf === 'failed') {
    return `${porada.document.failed[view.pdfFailure ?? 'error']} ${porada.document.fallback}`;
  }
  return porada.document.pending;
}

const href = (monday: string, format: 'docx' | 'pdf') =>
  `/porada/${monday}/dokument/${format}` as const;

/** The links of one document: the DOCX always, the PDF once the worker converted it. */
export function DocumentLinks({ view }: { readonly view: GeneratedView }) {
  return (
    <ul className="space-y-1">
      <li>
        <DownloadLink href={href(view.monday, 'docx')}>{porada.document.docx}</DownloadLink>
      </li>
      <li>
        {view.pdf === 'ready' ? (
          <DownloadLink href={href(view.monday, 'pdf')}>{porada.document.pdf}</DownloadLink>
        ) : (
          pdfNote(view)
        )}
      </li>
    </ul>
  );
}

/** „Dokument“: when the porada was generated and its files. */
export function DocumentCard({ view }: { readonly view: GeneratedView }) {
  return (
    <Card level={2} title={porada.document.title}>
      <div className="space-y-3">
        <p>{porada.document.at(view.date, view.time)}</p>
        <DocumentLinks view={view} />
      </div>
    </Card>
  );
}
