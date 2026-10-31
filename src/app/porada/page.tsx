import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import { poradaIndexPage, requireSignedIn } from '@/server/pages';
import { pageTitle, porada } from '@/ui/copy';
import { NoPorada } from '@/ui/features/porada';
import { Shell } from '@/ui/shell';

export const metadata: Metadata = { title: pageTitle(porada.title) };

/** „Porada“: opens the porada to prepare, or says there is none. */
export default async function PoradaPage() {
  const viewer = await requireSignedIn('/porada');
  const model = await poradaIndexPage();
  if (model === null) notFound();
  if (model.working !== null) redirect(`/porada/${model.working}`);
  return (
    <Shell viewer={viewer} current="/porada">
      <NoPorada />
    </Shell>
  );
}
