import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { setIssueDetails } from '@/server/actions';
import { issueTextsPage, requireSignedIn } from '@/server/pages';
import { pageTitle, porada } from '@/ui/copy';
import { DetailsPage } from '@/ui/features/porada';
import { Shell } from '@/ui/shell';

export const metadata: Metadata = { title: pageTitle(porada.details.title) };

/** „Údaje“: the headmaster writes who was present and who the guests were. */
export default async function PoradaDetailsPage({
  params,
}: {
  readonly params: Promise<{ readonly datum: string }>;
}) {
  const { datum } = await params;
  const viewer = await requireSignedIn(`/porada/${encodeURIComponent(datum)}/udaje`);
  const model = await issueTextsPage(datum);
  if (model === null) notFound();
  return (
    <Shell viewer={viewer} current="/porada">
      <DetailsPage model={model} action={setIssueDetails} />
    </Shell>
  );
}
