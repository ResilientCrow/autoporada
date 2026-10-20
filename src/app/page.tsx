import type { Metadata } from 'next';

import { requireSignedIn } from '@/server/pages';
import { cs, pageTitle } from '@/ui/copy';
import { Overview } from '@/ui/features/overview';
import { Shell } from '@/ui/shell';

export const metadata: Metadata = { title: pageTitle(cs.home.title) };

/** The home page: the state of the account; the dashboard (plan §8) replaces it in M8. */
export default async function HomePage() {
  const viewer = await requireSignedIn('/');
  return (
    <Shell viewer={viewer} current="/">
      <Overview pending={viewer.pending} />
    </Shell>
  );
}
