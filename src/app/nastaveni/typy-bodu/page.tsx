import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { savePointType } from '@/server/actions';
import { pointTypesPage, requireSignedIn } from '@/server/pages';
import { cs, pageTitle } from '@/ui/copy';
import { PointTypes } from '@/ui/features/point-types';
import { Shell } from '@/ui/shell';

export const metadata: Metadata = { title: pageTitle(cs.pointTypes.title) };

/** „Typy bodů“: for the headmaster, what each kind of point offers. */
export default async function PointTypesPage() {
  const viewer = await requireSignedIn('/nastaveni/typy-bodu');
  const model = await pointTypesPage();
  if (model === null) notFound();
  return (
    <Shell viewer={viewer} current="/nastaveni/typy-bodu">
      <PointTypes view={model} savePointType={savePointType} />
    </Shell>
  );
}
