/** Who is signed in on this request: resolved once per request, whoever asks. */
import { cache } from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import type { UserPrincipal } from '@/application/ports';
import { me } from '@/application/use-cases';
import type { Actor } from '@/domain/actor';
import { safeReturnTo } from '@/domain/identity';

import { getContainer } from '../container';
import { runRegistered, sessionTokenFrom } from '../pipeline';

async function requestId(): Promise<string> {
  return getContainer().requestIdFrom((await headers()).get('x-request-id'));
}

/**
 * The signed-in user of this request, or null. A cookie sent twice counts as
 * none. React's `cache` makes it one lookup per server render (fresh for the
 * next request); outside a render, as in unit tests, it is a plain call.
 */
export const getViewer = cache(async (): Promise<UserPrincipal | null> => {
  const token = sessionTokenFrom((await headers()).get('cookie'));
  return getContainer().resolvePrincipal(token, await requestId());
});

interface SignedInModel {
  readonly displayName: string;
  readonly actor: Actor;
  /** Still waiting for the headmaster to approve the account. */
  readonly pending: boolean;
}

/** The viewer with their profile, or null for a visitor (no database call without a session). */
const currentSignedIn = cache(async (): Promise<SignedInModel | null> => {
  const viewer = await getViewer();
  if (!viewer) return null;
  const result = await runRegistered(getContainer(), me, {
    principal: viewer,
    requestId: await requestId(),
    input: {},
  });
  if (!result.ok) throw new Error(`profile.me: ${result.error.code}`);
  const { displayName, role } = result.value;
  return { displayName, actor: viewer.actor, pending: role === 'pending' };
});

/** The signed-in user, or a redirect to the sign-in page that comes back to `path`. */
export async function requireSignedIn(path: string): Promise<SignedInModel> {
  const model = await currentSignedIn();
  if (!model) redirect(`/prihlaseni?returnTo=${encodeURIComponent(safeReturnTo(path))}`);
  return model;
}

/** The signed-in user, or null for a visitor. */
export const optionalSignedIn = currentSignedIn;
