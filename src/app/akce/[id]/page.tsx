import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { futurePage, requireSignedIn } from '@/server/pages';
import { future, pageTitle } from '@/ui/copy';
import { FutureRead } from '@/ui/features/future';
import { Shell } from '@/ui/shell';

/** No item title in the tab: a title can name people, and the tab title reaches history and shared screens. */
export const metadata: Metadata = { title: pageTitle(future.item) };

/** One akce or jednání, read-only for now (its editor follows). */
export default async function FuturePage({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>;
}) {
  const { id } = await params;
  const viewer = await requireSignedIn(`/akce/${encodeURIComponent(id)}`);
  const model = await futurePage(id);
  if (model === null) notFound();
  return (
    <Shell viewer={viewer} current="/akce">
      <FutureRead item={model} />
    </Shell>
  );
}
