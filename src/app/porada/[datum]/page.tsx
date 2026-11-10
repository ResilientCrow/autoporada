import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import { dropIssue, moveIssue } from '@/server/actions';
import { poradaPage, requireSignedIn } from '@/server/pages';
import { pageTitle, porada } from '@/ui/copy';
import { Workspace } from '@/ui/features/porada';
import { Shell } from '@/ui/shell';

export const metadata: Metadata = { title: pageTitle(porada.title) };

/** One porada of the calendar, by the Monday that keys it; 404 for any other date. */
export default async function PoradaDatumPage({
  params,
}: {
  readonly params: Promise<{ readonly datum: string }>;
}) {
  const { datum } = await params;
  const viewer = await requireSignedIn(`/porada/${encodeURIComponent(datum)}`);
  const model = await poradaPage(datum);
  if (model === null) notFound();
  if (model.kind === 'preview') redirect(`/porada/${model.monday}/nahled`);
  return (
    <Shell viewer={viewer} current="/porada">
      <Workspace view={model.model} moveIssue={moveIssue} dropIssue={dropIssue} />
    </Shell>
  );
}
