import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { decideAccess } from '@/server/actions';
import { requireSignedIn, userPage } from '@/server/pages';
import { pageTitle, users } from '@/ui/copy';
import { UserAdmin } from '@/ui/features/users';
import { Shell } from '@/ui/shell';

export const metadata: Metadata = { title: pageTitle(users.detail.title) };

/** One user: their facts and, for the headmaster, the decision on their request. */
export default async function UserPage({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>;
}) {
  const { id } = await params;
  const viewer = await requireSignedIn(`/uzivatele/${encodeURIComponent(id)}`);
  const model = await userPage(id);
  if (model === null) notFound();
  return (
    <Shell viewer={viewer} current="/uzivatele">
      <UserAdmin view={model} decideAccess={decideAccess} />
    </Shell>
  );
}
