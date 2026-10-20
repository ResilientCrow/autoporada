/** What pages under src/app read, through the same container and pipeline as actions. */
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import type { UserPrincipal } from '@/application/ports';
import { me } from '@/application/use-cases';
import { isSignInError, type SignInError } from '@/contracts';
import { safeReturnTo } from '@/domain/identity';

import { getContainer } from '../container';
import { NONCE_HEADER } from '../http';
import { runRegistered, sessionTokenFrom } from '../pipeline';

const REQUEST_ID = /^[A-Za-z0-9-]{8,64}$/;

async function requestId(): Promise<string> {
  return getContainer().requestIdFrom((await headers()).get('x-request-id'));
}

/** What newNonce makes: 128 bits in base64. */
const NONCE_SHAPE = /^[A-Za-z0-9+/]{22}==$/;

/**
 * This response's CSP nonce, as the proxy set it, or null. The proxy matcher
 * skips prefetch requests, so the header can come from the client: anything
 * but the shape of a real nonce is ignored.
 */
export async function cspNonce(): Promise<string | null> {
  const value = (await headers()).get(NONCE_HEADER);
  return value !== null && NONCE_SHAPE.test(value) ? value : null;
}

/** The signed-in user of this request, or null. A cookie sent twice counts as none. */
export async function getViewer(): Promise<UserPrincipal | null> {
  const token = sessionTokenFrom((await headers()).get('cookie'));
  return getContainer().resolvePrincipal(token, await requestId());
}

/** The signed-in user, or a redirect to the sign-in page that comes back to `path`. */
export async function requireViewer(path: string): Promise<UserPrincipal> {
  const viewer = await getViewer();
  if (!viewer) redirect(`/prihlaseni?returnTo=${encodeURIComponent(safeReturnTo(path))}`);
  return viewer;
}

export interface HomeModel {
  readonly displayName: string;
  readonly pending: boolean;
}

/** The home page: who is signed in and whether they still wait for approval. */
export async function homePage(viewer: UserPrincipal): Promise<HomeModel> {
  const container = getContainer();
  const result = await runRegistered(container, me, {
    principal: viewer,
    requestId: await requestId(),
    input: {},
  });
  if (!result.ok) throw new Error(`profile.me: ${result.error.code}`);
  return { displayName: result.value.displayName, pending: result.value.role === 'pending' };
}

export interface SignInPageModel {
  readonly error: SignInError | null;
  /** The request id to report (the redirects add it only where there is something to report). */
  readonly code: string | null;
  readonly loggedOut: 'here' | 'everywhere' | null;
  /** After any sign-out, also a failed one: Entra's session outlives ours (risk 12). */
  readonly sharedComputerHint: boolean;
  readonly loginHref: string;
  readonly switchHref: string;
}

type SearchParams = Readonly<Record<string, string | string[] | undefined>>;
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export interface GalleryModel {
  /** Asked to fail, to see the error page (`?stav=vyjimka`). */
  readonly fail: boolean;
}

/** The pattern gallery, or null where it must not exist (production). */
export function galleryPage(params: SearchParams): GalleryModel | null {
  if (getContainer().environment === 'production') return null;
  return { fail: first(params['stav']) === 'vyjimka' };
}

/** The sign-in page from its query string; anything unexpected is ignored. */
export function signInPage(params: SearchParams): SignInPageModel {
  const error = first(params['chyba']);
  const code = first(params['kod']);
  const loggedOut = first(params['odhlaseno']);
  const returnTo = encodeURIComponent(safeReturnTo(first(params['returnTo'])));
  const switchHref = `/auth/login?returnTo=${returnTo}&account=select`;
  const signedOut = loggedOut === 'vsude' ? 'everywhere' : loggedOut === '1' ? 'here' : null;
  return {
    error: isSignInError(error) ? error : null,
    code: code && REQUEST_ID.test(code) ? code : null,
    loggedOut: signedOut,
    sharedComputerHint: signedOut !== null || error === 'signout-failed',
    // After signing out, Entra still knows the browser (a shared PC): even
    // the main button lets the next person choose the account (risk 12).
    loginHref:
      signedOut || error === 'signout-failed' ? switchHref : `/auth/login?returnTo=${returnTo}`,
    switchHref,
  };
}
