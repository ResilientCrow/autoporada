import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { archivePage, requireSignedIn } from '@/server/pages';
import { pageTitle, porada } from '@/ui/copy';
import { ArchivePage } from '@/ui/features/porada';
import { Shell } from '@/ui/shell';

export const metadata: Metadata = { title: pageTitle(porada.archive.title) };

/** „Archiv porad“: every generated porada with its DOCX and PDF; for the staff. */
export default async function PoradaArchivePage() {
  const viewer = await requireSignedIn('/porada/archiv');
  const model = await archivePage();
  if (model === null) notFound();
  return (
    <Shell viewer={viewer} current="/porada/archiv">
      <ArchivePage view={model} />
    </Shell>
  );
}
