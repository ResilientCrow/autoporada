import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { pointStatus, savePoint } from '@/server/actions';
import { pointPage, requireSignedIn } from '@/server/pages';
import { pageTitle, points } from '@/ui/copy';
import { PointScreen } from '@/ui/features/points';
import { Shell } from '@/ui/shell';

/** No point title in the tab: a title can name people, and the tab title reaches history and shared screens. */
export const metadata: Metadata = { title: pageTitle(points.title.point) };

/** One point: the editor for its author while it is a draft or returned, the read view otherwise. */
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
      <PointScreen point={model} savePoint={savePoint} pointStatus={pointStatus} />
    </Shell>
  );
}
