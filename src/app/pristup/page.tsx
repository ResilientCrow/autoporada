import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { cancelAccess, requestAccess } from '@/server/actions';
import { accessPage, requireSignedIn } from '@/server/pages';
import { cs, pageTitle } from '@/ui/copy';
import { AccessRequest } from '@/ui/features/access';
import { Shell } from '@/ui/shell';

export const metadata: Metadata = { title: pageTitle(cs.access.title) };

/** „Žádost o přístup“: where a waiting user stands and, later, asks. */
export default async function AccessPage() {
  const viewer = await requireSignedIn('/pristup');
  const model = await accessPage();
  if (model === null) notFound();
  return (
    <Shell viewer={viewer} current="/pristup">
      <AccessRequest view={model} requestAccess={requestAccess} cancelAccess={cancelAccess} />
    </Shell>
  );
}
