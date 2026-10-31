import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { setIssueAnnex2 } from '@/server/actions';
import { issueTextsPage, requireSignedIn } from '@/server/pages';
import { pageTitle, porada } from '@/ui/copy';
import { Annex2Page } from '@/ui/features/porada';
import { Shell } from '@/ui/shell';

export const metadata: Metadata = { title: pageTitle(porada.annex2.title) };

/** „Příloha 2“: the headmaster writes or removes the text of the second annex. */
export default async function PoradaAnnex2Page({
  params,
}: {
  readonly params: Promise<{ readonly datum: string }>;
}) {
  const { datum } = await params;
  const viewer = await requireSignedIn(`/porada/${encodeURIComponent(datum)}/priloha-2`);
  const model = await issueTextsPage(datum);
  if (model === null) notFound();
  return (
    <Shell viewer={viewer} current="/porada">
      <Annex2Page model={model} action={setIssueAnnex2} />
    </Shell>
  );
}
