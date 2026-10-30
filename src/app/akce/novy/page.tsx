import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { createFuture } from '@/server/actions';
import { newFuturePage, requireSignedIn } from '@/server/pages';
import { future, pageTitle } from '@/ui/copy';
import { FutureChooser } from '@/ui/features/future';
import { Shell } from '@/ui/shell';

export const metadata: Metadata = { title: pageTitle(future.new) };

/** „Nová akce“: what to start, a akce or a jednání; „Začít“ opens the new draft. */
export default async function NewFuturePage() {
  const viewer = await requireSignedIn('/akce/novy');
  const model = await newFuturePage();
  if (model === null) notFound();
  return (
    <Shell viewer={viewer} current="/akce">
      <FutureChooser kinds={model.kinds} createFuture={createFuture} />
    </Shell>
  );
}
