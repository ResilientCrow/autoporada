import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { createPoint } from '@/server/actions';
import { newProposalPage, requireSignedIn } from '@/server/pages';
import { pageTitle, points } from '@/ui/copy';
import { ProposalChooser } from '@/ui/features/points';
import { Shell } from '@/ui/shell';

export const metadata: Metadata = { title: pageTitle(points.proposal.title) };

/** „Nový návrh“: the kind of proposal to start, finance or pokyn; „Začít“ opens the new draft. */
export default async function NewProposalPage() {
  const viewer = await requireSignedIn('/navrhy/novy');
  const model = await newProposalPage();
  if (model === null) notFound();
  return (
    <Shell viewer={viewer} current="/body">
      <ProposalChooser kinds={model.kinds} createPoint={createPoint} />
    </Shell>
  );
}
