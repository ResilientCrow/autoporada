import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { addEntries, previewPaste } from '@/server/actions';
import { registryPage, requireSignedIn } from '@/server/pages';
import { pageTitle, registry } from '@/ui/copy';
import { Paste } from '@/ui/features/registry';
import { Shell } from '@/ui/shell';

export const metadata: Metadata = { title: pageTitle(registry.paste.title) };

/** „Vložit seznam“: for the headmaster, a pasted class list is checked, then added. */
export default async function PastePage({
  params,
}: {
  readonly params: Promise<{ readonly klic: string }>;
}) {
  const { klic } = await params;
  const viewer = await requireSignedIn(`/registr/${encodeURIComponent(klic)}/vlozit`);
  const model = await registryPage(klic);
  if (model === null || model.current === null || !model.canEdit) notFound();
  return (
    <Shell viewer={viewer} current="/registr">
      <Paste
        view={{ list: model.current.list }}
        previewPaste={previewPaste}
        addEntries={addEntries}
      />
    </Shell>
  );
}
