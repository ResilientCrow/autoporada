import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { addEntries, removeEntry, saveEntry } from '@/server/actions';
import { registryPage, requireSignedIn } from '@/server/pages';
import { pageTitle, registry } from '@/ui/copy';
import { Entries } from '@/ui/features/registry';
import { Shell } from '@/ui/shell';

export const metadata: Metadata = { title: pageTitle(registry.title) };

/** One list of the registry with its students in the document's order. */
export default async function RegistryListPage({
  params,
}: {
  readonly params: Promise<{ readonly klic: string }>;
}) {
  const { klic } = await params;
  const viewer = await requireSignedIn(`/registr/${encodeURIComponent(klic)}`);
  const model = await registryPage(klic);
  if (model === null || model.current === null) notFound();
  return (
    <Shell viewer={viewer} current="/registr">
      <Entries
        view={{ list: model.current.list, entries: model.current.entries, canEdit: model.canEdit }}
        addEntries={addEntries}
        saveEntry={saveEntry}
        removeEntry={removeEntry}
      />
    </Shell>
  );
}
