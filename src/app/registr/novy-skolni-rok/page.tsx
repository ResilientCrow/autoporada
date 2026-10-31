import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { newSchoolYear } from '@/server/actions';
import { newYearPage, requireSignedIn } from '@/server/pages';
import { pageTitle, registry } from '@/ui/copy';
import { NewYear } from '@/ui/features/registry';
import { Shell } from '@/ui/shell';

export const metadata: Metadata = { title: pageTitle(registry.newYear.title) };

/** „Nový školní rok“: for the headmaster, after a fresh sign-in, the lists are emptied into the archive. */
export default async function NewYearPage() {
  const viewer = await requireSignedIn('/registr/novy-skolni-rok');
  const model = await newYearPage();
  if (model === null) notFound();
  return (
    <Shell viewer={viewer} current="/registr">
      <NewYear
        view={{
          lists: model.lists.map(({ id, title, entries }) => ({ id, title, entries })),
          years: model.years,
        }}
        freshAuth={viewer.freshAuth}
        newSchoolYear={newSchoolYear}
      />
    </Shell>
  );
}
