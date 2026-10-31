import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import { addOutlineItem, saveOutlineItem } from '@/server/actions';
import { outlineItemPage, requireSignedIn } from '@/server/pages';
import { pageTitle, porada } from '@/ui/copy';
import { ItemEditor } from '@/ui/features/porada';
import { SlantLabel } from '@/ui/kit';
import { Shell } from '@/ui/shell';

export const metadata: Metadata = { title: pageTitle(porada.outline.editor.editTitle) };

/** One item for editing; a proposal's text is edited in its review, so that row sends the page there. */
export default async function OutlineItemPage({
  params,
}: {
  readonly params: Promise<{ readonly datum: string; readonly polozka: string }>;
}) {
  const { datum, polozka } = await params;
  const viewer = await requireSignedIn(
    `/porada/${encodeURIComponent(datum)}/pokyny/${encodeURIComponent(polozka)}`,
  );
  const model = await outlineItemPage(datum, polozka);
  if (model === null) notFound();
  if (model.kind === 'proposal') redirect(`/kontrola/${model.pointId}`);
  return (
    <Shell viewer={viewer} current="/porada">
      <SlantLabel level={1}>{porada.outline.editor.editTitle}</SlantLabel>
      <div className="mt-4 space-y-8">
        <p>{porada.meeting(model.context.meeting)}</p>
        <ItemEditor
          context={model.context}
          section={model.item.section}
          item={model.item}
          actions={{ add: addOutlineItem, save: saveOutlineItem }}
        />
      </div>
    </Shell>
  );
}
