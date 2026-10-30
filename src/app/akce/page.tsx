import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { futureListPage, requireSignedIn } from '@/server/pages';
import { future, pageTitle } from '@/ui/copy';
import { FutureList } from '@/ui/features/future';
import { Shell } from '@/ui/shell';

export const metadata: Metadata = { title: pageTitle(future.title) };

/** „Akce“: the jednání and akce the reader may see, last changed first, a page at a time (`?pred` continues). */
export default async function FutureListPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const viewer = await requireSignedIn('/akce');
  const model = await futureListPage(await searchParams);
  if (model === null) notFound();
  return (
    <Shell viewer={viewer} current="/akce">
      <FutureList
        rows={model.rows}
        next={model.next}
        first={model.first}
        canCreate={model.canCreate}
      />
    </Shell>
  );
}
