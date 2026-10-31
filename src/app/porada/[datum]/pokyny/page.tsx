import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { addOutlineItem, moveOutlineItem, removeOutlineItem } from '@/server/actions';
import { outlinePage, requireSignedIn } from '@/server/pages';
import { pageTitle, porada } from '@/ui/copy';
import { OutlinePage } from '@/ui/features/porada';
import { Shell } from '@/ui/shell';

export const metadata: Metadata = { title: pageTitle(porada.outline.title) };

/** „Pokyny a hospodaření“: the headmaster orders and adds the items of the two sections. */
export default async function PoradaOutlinePage({
  params,
}: {
  readonly params: Promise<{ readonly datum: string }>;
}) {
  const { datum } = await params;
  const viewer = await requireSignedIn(`/porada/${encodeURIComponent(datum)}/pokyny`);
  const model = await outlinePage(datum);
  if (model === null) notFound();
  return (
    <Shell viewer={viewer} current="/porada">
      <OutlinePage
        model={model}
        actions={{ add: addOutlineItem, move: moveOutlineItem, remove: removeOutlineItem }}
      />
    </Shell>
  );
}
