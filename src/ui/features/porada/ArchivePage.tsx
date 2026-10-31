import { porada } from '@/ui/copy';
import { SlantLabel } from '@/ui/kit';

import { DocumentLinks, type GeneratedView } from './DocumentCard';

/** The archive as the page model writes it: the latest meeting first. */
export interface ArchiveView {
  readonly documents: readonly (GeneratedView & { readonly meeting: string })[];
}

/** „Archiv porad“: each generated porada with when it was generated and its files. */
export function ArchivePage({ view }: { readonly view: ArchiveView }) {
  return (
    <>
      <SlantLabel level={1}>{porada.archive.title}</SlantLabel>
      {view.documents.length === 0 ? (
        <p className="mt-4">{porada.archive.empty}</p>
      ) : (
        <ul className="mt-4 space-y-6">
          {view.documents.map((document) => (
            <li key={document.monday} className="space-y-2">
              <h2 className="text-xl">{porada.archive.meeting(document.meeting)}</h2>
              <p>{porada.document.at(document.date, document.time)}</p>
              <DocumentLinks view={document} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
