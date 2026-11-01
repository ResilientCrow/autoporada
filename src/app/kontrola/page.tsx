import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { queuePage, requireSignedIn } from '@/server/pages';
import { pageTitle, review } from '@/ui/copy';
import { Queue } from '@/ui/features/review';
import { Shell } from '@/ui/shell';

export const metadata: Metadata = { title: pageTitle(review.title) };

/** „Schválení bodů“: the handed-in points waiting for a reviewer's decision; 404 for anyone who may not review. */
export default async function QueuePage() {
  const viewer = await requireSignedIn('/kontrola');
  const model = await queuePage();
  if (model === null) notFound();
  return (
    <Shell viewer={viewer} current="/kontrola">
      <Queue queue={model} />
    </Shell>
  );
}
