/** Who is signed in on this request: resolved once per request, whoever asks. */
import { cache } from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import type { UserPrincipal } from '@/application/ports';
import { me } from '@/application/use-cases';
import type { Actor } from '@/domain/actor';
import { safeReturnTo } from '@/domain/identity';
import { isFreshAuth } from '@/domain/policy';

import { getContainer } from '../container';
import { sessionTokenFrom } from '../pipeline';
import { isRefusal } from './not-found';
import { causeOfFault, pageFailureOf } from './page-failure';
import { guardPage, logPageFailure, runPage } from './run-page';

export async function requestId(): Promise<string> {
  return getContainer().requestIdFrom((await headers()).get('x-request-id'));
}

/**
 * The signed-in user of this request, or null. A cookie sent twice counts as
 * none. React's `cache` makes it one lookup per server render (fresh for the
 * next request); outside a render, as in unit tests, it is a plain call.
 */
export const getViewer = cache(async (): Promise<UserPrincipal | null> => {
  const token = sessionTokenFrom((await headers()).get('cookie'));
  const id = await requestId();
  return guardPage('auth.session', id, () => getContainer().resolvePrincipal(token, id));
});

interface SignedInModel {
  readonly displayName: string;
  readonly actor: Actor;
  /** Still waiting for the headmaster to approve the account. */
  readonly pending: boolean;
  /** Signed in at Entra recently enough for a step-up action (ADR 0002). */
  readonly freshAuth: boolean;
}

/** The viewer with their profile, or null for a visitor (no database call without a session). */
const currentSignedIn = cache(async (): Promise<SignedInModel | null> => {
  const viewer = await getViewer();
  if (!viewer) return null;
  const id = await requestId();
  const result = await runPage(me, { principal: viewer, requestId: id, input: {} });
  if (!result.ok) {
    const { code } = result.error;
    // A fault was logged by `runPage`; a refusal (the user is gone) is a failure here, so log it.
    if (isRefusal(code)) logPageFailure('profile.me', id, causeOfFault(code), { name: code });
    throw pageFailureOf(`profile.me: ${code}`, code);
  }
  const { displayName, role } = result.value;
  return {
    displayName,
    actor: viewer.actor,
    pending: role === 'pending',
    freshAuth: isFreshAuth(viewer.authTime, getContainer().app.clock.now()),
  };
});

/** The signed-in user, or a redirect to the sign-in page that comes back to `path`. */
export async function requireSignedIn(path: string): Promise<SignedInModel> {
  const model = await currentSignedIn();
  if (!model) redirect(`/prihlaseni?returnTo=${encodeURIComponent(safeReturnTo(path))}`);
  return model;
}

/** The signed-in user, or null for a visitor. */
export const optionalSignedIn = currentSignedIn;
