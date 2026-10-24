import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { requireSignedIn, usersPage } from '@/server/pages';
import { cs, pageTitle } from '@/ui/copy';
import { UsersList } from '@/ui/features/users';
import { Shell } from '@/ui/shell';

export const metadata: Metadata = { title: pageTitle(cs.users.title) };

/** „Uživatelé“: for the headmaster, the people of the school and their access. */
export default async function UsersPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const viewer = await requireSignedIn('/uzivatele');
  const model = await usersPage(await searchParams);
  if (model === null) notFound();
  return (
    <Shell viewer={viewer} current="/uzivatele">
      <UsersList view={model} />
    </Shell>
  );
}
