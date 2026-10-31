import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { previewPage, requireSignedIn } from '@/server/pages';
import { pageTitle, porada } from '@/ui/copy';
import { PreviewPage } from '@/ui/features/porada';
import { Shell } from '@/ui/shell';

export const metadata: Metadata = { title: pageTitle(porada.preview.title) };

/** „Náhled“ of one porada: the document as it would print now, with the preflight above it; for the staff. */
export default async function PoradaPreviewPage({
  params,
}: {
  readonly params: Promise<{ readonly datum: string }>;
}) {
  const { datum } = await params;
  const viewer = await requireSignedIn(`/porada/${encodeURIComponent(datum)}/nahled`);
  const model = await previewPage(datum);
  if (model === null) notFound();
  return (
    <Shell viewer={viewer} current="/porada">
      <PreviewPage view={model} />
    </Shell>
  );
}
