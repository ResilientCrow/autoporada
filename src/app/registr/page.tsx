import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { moveList, saveList } from '@/server/actions';
import { registryPage, requireSignedIn } from '@/server/pages';
import { pageTitle, registry } from '@/ui/copy';
import { Lists } from '@/ui/features/registry';
import { Shell } from '@/ui/shell';

export const metadata: Metadata = { title: pageTitle(registry.title) };

/** „Registr“: the lists of students the document prints; the headmaster edits, staff reviewers read. */
export default async function RegistryPage() {
  const viewer = await requireSignedIn('/registr');
  const model = await registryPage();
  if (model === null) notFound();
  return (
    <Shell viewer={viewer} current="/registr">
      <Lists
        view={{
          lists: model.lists,
          canEdit: model.canEdit,
        }}
        saveList={saveList}
        moveList={moveList}
      />
    </Shell>
  );
}
