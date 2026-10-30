import type { Metadata } from 'next';

import { setReminders } from '@/server/actions';
import { requireSignedIn } from '@/server/pages';
import { cs, pageTitle } from '@/ui/copy';
import { Profile } from '@/ui/features/profile';
import { Shell } from '@/ui/shell';

export const metadata: Metadata = { title: pageTitle(cs.profile.title) };

/** „Profil“: what the signed-in user sets for themselves. */
export default async function ProfilePage() {
  const viewer = await requireSignedIn('/profil');
  return (
    <Shell viewer={viewer} current="/profil">
      <Profile view={{ remindDeadline: viewer.remindDeadline }} setReminders={setReminders} />
    </Shell>
  );
}
