import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { moveIssue } from '@/server/actions';
import { poradaMovePage, requireSignedIn } from '@/server/pages';
import { pageTitle, porada } from '@/ui/copy';
import { MovePage } from '@/ui/features/porada';
import { Shell } from '@/ui/shell';

export const metadata: Metadata = { title: pageTitle(porada.move.title) };

/** „Přesunout poradu“: the headmaster gives the porada of a Monday another date and deadline. */
export default async function PoradaMovePage({
  params,
}: {
  readonly params: Promise<{ readonly datum: string }>;
}) {
  const { datum } = await params;
  const viewer = await requireSignedIn(`/porada/${encodeURIComponent(datum)}/presunout`);
  const model = await poradaMovePage(datum);
  if (model === null) notFound();
  return (
    <Shell viewer={viewer} current="/porada">
      <MovePage model={model} moveIssue={moveIssue} />
    </Shell>
  );
}
