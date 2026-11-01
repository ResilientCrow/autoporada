import {
  isAadstsCode,
  isFailureCause,
  isSignInError,
  type FailureCause,
  type SignInError,
} from '@/contracts';
import { safeReturnTo } from '@/domain/identity';

import { getContainer } from '../container';
import { signInTechnical } from '../pipeline';

import { first, type SearchParams } from './params';

export interface SignInPageModel {
  readonly error: SignInError | null;
  /** A refusal's AADSTS number, which the administrator looks up. */
  readonly aadsts: string | null;
  /** Why a sign-out was not recorded. */
  readonly cause: FailureCause | null;
  /** Development's technical line (ADR 0044); always null in production. */
  readonly technical: string | null;
  readonly loggedOut: 'here' | 'everywhere' | null;
  /** After any sign-out, also a failed one: Entra's session outlives ours (risk 12). */
  readonly sharedComputerHint: boolean;
  readonly loginHref: string;
  readonly switchHref: string;
}

/**
 * The sign-in page from its query string; anything unexpected is ignored. Each value is checked
 * again here, whoever wrote the URL: an AADSTS number only with a refusal, a cause only with a
 * failed sign-out.
 */
export function signInPage(params: SearchParams): SignInPageModel {
  const chyba = first(params['chyba']);
  const error = isSignInError(chyba) ? chyba : null;
  const aadsts = first(params['aadsts']);
  const pricina = first(params['pricina']);
  const loggedOut = first(params['odhlaseno']);
  const returnTo = encodeURIComponent(safeReturnTo(first(params['returnTo'])));
  const switchHref = `/auth/login?returnTo=${returnTo}&account=select`;
  const signedOut = loggedOut === 'vsude' ? 'everywhere' : loggedOut === '1' ? 'here' : null;
  const { environment, devServices } = getContainer();
  return {
    error,
    aadsts: error === 'idp-refused' && isAadstsCode(aadsts) ? aadsts : null,
    cause: error === 'signout-failed' && isFailureCause(pricina) ? pricina : null,
    technical: environment === 'production' ? null : signInTechnical(error, devServices),
    loggedOut: signedOut,
    sharedComputerHint: signedOut !== null || error === 'signout-failed',
    // After signing out, Entra still knows the browser (a shared PC): even
    // the main button lets the next person choose the account (risk 12).
    loginHref:
      signedOut || error === 'signout-failed' ? switchHref : `/auth/login?returnTo=${returnTo}`,
    switchHref,
  };
}
