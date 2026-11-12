import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { confirmPlaceholder, setPlaceholder } from '@/server/actions';
import { missingReportsPage, requireSignedIn } from '@/server/pages';
import { pageTitle, porada } from '@/ui/copy';
import { MissingReportsPage } from '@/ui/features/porada';
import { Shell } from '@/ui/shell';

export const metadata: Metadata = { title: pageTitle(porada.missing.title) };

/** „Chybějící zprávy“: the headmaster rewrites the paragraph printed for an akce without a report. */
export default async function PoradaMissingReportsPage({
  params,
}: {
  readonly params: Promise<{ readonly datum: string }>;
}) {
  const { datum } = await params;
  const viewer = await requireSignedIn(`/porada/${encodeURIComponent(datum)}/zpravy`);
  const model = await missingReportsPage(datum);
  if (model === null) notFound();
  return (
    <Shell viewer={viewer} current="/porada">
      <MissingReportsPage model={model} action={setPlaceholder} confirmAction={confirmPlaceholder} />
    </Shell>
  );
}
