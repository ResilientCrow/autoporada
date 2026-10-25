import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { pointPage, requireSignedIn } from '@/server/pages';
import { pageTitle, points } from '@/ui/copy';
import { PointFacts, PointHeader } from '@/ui/features/points';
import { Shell } from '@/ui/shell';

/** No point title in the tab: a title can name people, and the tab title reaches history and shared screens. */
export const metadata: Metadata = { title: pageTitle(points.title.point) };

/** One point: the header and, for now, the read view of every state (the editor joins with row 28). */
export default async function PointPage({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>;
}) {
  const { id } = await params;
  const viewer = await requireSignedIn(`/body/${encodeURIComponent(id)}`);
  const model = await pointPage(id);
  if (model === null) notFound();
  return (
    <Shell viewer={viewer} current="/body">
      <div className="space-y-4">
        <PointHeader
          kind={model.kind}
          state={model.state}
          title={model.title}
          typeName={model.typeName}
        />
        <PointFacts facts={model.facts} />
      </div>
    </Shell>
  );
}
