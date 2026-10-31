import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { addOutlineItem, saveOutlineItem } from '@/server/actions';
import { newOutlineItemPage, requireSignedIn } from '@/server/pages';
import { pageTitle, porada } from '@/ui/copy';
import { ItemEditor } from '@/ui/features/porada';
import { Shell } from '@/ui/shell';
import { SlantLabel } from '@/ui/kit';

export const metadata: Metadata = { title: pageTitle(porada.outline.editor.newTitle) };

/** A new item with its text; `?cast=hospodareni` puts it in HOSPODAŘENÍ, anything else in POKYNY. */
export default async function NewOutlineItemPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ readonly datum: string }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { datum } = await params;
  const { cast } = await searchParams;
  const viewer = await requireSignedIn(`/porada/${encodeURIComponent(datum)}/pokyny/nova`);
  const model = await newOutlineItemPage(datum, cast === 'hospodareni' ? 'hospodareni' : 'pokyny');
  if (model === null) notFound();
  return (
    <Shell viewer={viewer} current="/porada">
      <SlantLabel level={1}>{porada.outline.editor.newTitle}</SlantLabel>
      <div className="mt-4 space-y-8">
        <p>{porada.meeting(model.context.meeting)}</p>
        <ItemEditor
          context={model.context}
          section={model.section}
          item={null}
          actions={{ add: addOutlineItem, save: saveOutlineItem }}
        />
      </div>
    </Shell>
  );
}
