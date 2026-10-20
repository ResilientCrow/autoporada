import type { Metadata } from 'next';

import { optionalSignedIn } from '@/server/pages';
import { cs, pageTitle } from '@/ui/copy';
import { PrivacyNotice } from '@/ui/features/privacy';
import { Shell } from '@/ui/shell';

export const metadata: Metadata = { title: pageTitle(cs.privacy.title) };

/** Public: anyone may read it, and a signed-in reader keeps their header. */
export default async function PrivacyPage() {
  const viewer = await optionalSignedIn();
  return (
    <Shell viewer={viewer ?? undefined} current="/ochrana-osobnich-udaju">
      <PrivacyNotice notice={cs.privacy} />
    </Shell>
  );
}
