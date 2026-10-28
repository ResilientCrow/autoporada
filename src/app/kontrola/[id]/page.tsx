import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { decidePoint, reviewEditPoint } from '@/server/actions';
import { requireSignedIn, reviewPointPage } from '@/server/pages';
import { pageTitle, review } from '@/ui/copy';
import { DecisionBar, PointReview } from '@/ui/features/points';
import { Shell } from '@/ui/shell';

/** No point title in the tab: a title can name people, and the tab title reaches history and shared screens. */
export const metadata: Metadata = { title: pageTitle(review.point) };

/** One point under review: its read view, or the reviewer's editor in its place, with the decision bar between the content and the history. */
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
      <PointReview
        point={model}
        host={(read) => (
          <DecisionBar
            id={model.id}
            version={model.version}
            bar={model.bar}
            decidePoint={decidePoint}
            read={read}
            edit={model.edit}
            reviewEditPoint={reviewEditPoint}
          />
        )}
      />
    </Shell>
  );
}
