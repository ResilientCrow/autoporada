/** What pages under src/app read, through the same container and pipeline as actions. */
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';

import type { UserPrincipal } from '@/application/ports';
import { me } from '@/application/use-cases';
import { isSignInError, type SignInError } from '@/contracts';
import { safeReturnTo } from '@/domain/identity';

import { getContainer } from '../container';
import { runRegistered, SESSION_COOKIE } from '../pipeline';

const REQUEST_ID = /^[A-Za-z0-9-]{8,64}$/;

async function requestId(): Promise<string> {
  return getContainer().requestIdFrom((await headers()).get('x-request-id'));
}

/** The signed-in user of this request, or null. A cookie sent twice counts as none. */
export async function getViewer(): Promise<UserPrincipal | null> {
  const sessions = (await cookies()).getAll(SESSION_COOKIE);
  if (sessions.length !== 1) return null;
  return getContainer().resolvePrincipal(sessions[0]?.value ?? null, await requestId());
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
  /** The request id to report, shown only with failed and unavailable. */
  readonly code: string | null;
  readonly loggedOut: 'here' | 'everywhere' | null;
  readonly loginHref: string;
  readonly switchHref: string;
}

type SearchParams = Readonly<Record<string, string | string[] | undefined>>;
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** The sign-in page from its query string; anything unexpected is ignored. */
export function signInPage(params: SearchParams): SignInPageModel {
  const error = first(params['chyba']);
  const code = first(params['kod']);
  const loggedOut = first(params['odhlaseno']);
  const returnTo = encodeURIComponent(safeReturnTo(first(params['returnTo'])));
  return {
    error: isSignInError(error) ? error : null,
    code: code && REQUEST_ID.test(code) ? code : null,
    loggedOut: loggedOut === 'vsude' ? 'everywhere' : loggedOut === '1' ? 'here' : null,
    loginHref: `/auth/login?returnTo=${returnTo}`,
    // After signing out, Entra still knows the browser: let the next person choose.
    switchHref: `/auth/login?returnTo=${returnTo}&account=select`,
  };
}
