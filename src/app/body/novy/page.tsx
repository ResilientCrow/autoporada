import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { createPoint } from '@/server/actions';
import { newPointPage, requireSignedIn } from '@/server/pages';
import { pageTitle, points } from '@/ui/copy';
import { TypeChooser } from '@/ui/features/points';
import { Shell } from '@/ui/shell';

export const metadata: Metadata = { title: pageTitle(points.title.new) };

/** „Nový bod“: the type to start a report on; „Začít“ opens the new draft. */
export default async function NewPointPage() {
  const viewer = await requireSignedIn('/body/novy');
  const model = await newPointPage();
  if (model === null) notFound();
  return (
    <Shell viewer={viewer} current="/body">
      <TypeChooser types={model.types} createPoint={createPoint} />
    </Shell>
  );
}
