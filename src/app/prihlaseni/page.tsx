import type { Metadata } from 'next';

import { signInPage } from '@/server/pages';
import { cs, pageTitle } from '@/ui/copy';
import { SignInPanel } from '@/ui/features/sign-in';
import { Shell } from '@/ui/shell';

export const metadata: Metadata = { title: pageTitle(cs.signIn.title) };

type Props = { readonly searchParams: Promise<Record<string, string | string[] | undefined>> };

/** The sign-in page, for visitors: the anonymous shell. Links, never prefetched: each start stores a sign-in. */
export default async function SignInPage({ searchParams }: Props) {
  return (
    <Shell>
      <SignInPanel {...signInPage(await searchParams)} />
    </Shell>
  );
}
