import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { futureQueuePage, requireSignedIn } from '@/server/pages';
import { pageTitle, review } from '@/ui/copy';
import { QueueFuture } from '@/ui/features/review';
import { Shell } from '@/ui/shell';

export const metadata: Metadata = { title: pageTitle(review.future.title) };

/** „Schválení budoucích akcí“: the handed-in akce and jednání; 404 for anyone who may not review. */
export default async function FutureQueuePage() {
  const viewer = await requireSignedIn('/kontrola/akce');
  const model = await futureQueuePage();
  if (model === null) notFound();
  return (
    <Shell viewer={viewer} current="/kontrola/akce">
      <QueueFuture future={model} />
    </Shell>
  );
}
