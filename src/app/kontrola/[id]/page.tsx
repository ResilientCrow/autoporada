import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { requireSignedIn, reviewPointPage } from '@/server/pages';
import { pageTitle, review } from '@/ui/copy';
import { PointReview } from '@/ui/features/points';
import { Shell } from '@/ui/shell';

/** No point title in the tab: a title can name people, and the tab title reaches history and shared screens. */
export const metadata: Metadata = { title: pageTitle(review.point) };

/** One point under review: its read view; the decision bar joins in the bar slot (design row 39). */
export default async function ReviewPointPage({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>;
}) {
  const { id } = await params;
  const viewer = await requireSignedIn(`/kontrola/${encodeURIComponent(id)}`);
  const model = await reviewPointPage(id);
  if (model === null) notFound();
  return (
    <Shell viewer={viewer} current="/kontrola" width="wide">
      <PointReview point={model} />
    </Shell>
  );
}
