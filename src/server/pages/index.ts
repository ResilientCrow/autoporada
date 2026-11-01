/** What pages under src/app read, through the same container and pipeline as actions. */
import { cookies, headers } from 'next/headers';

import { getContainer } from '../container';
import { NONCE_HEADER } from '../http';

import { first, type SearchParams } from './params';

export { accessPage } from './access';
export { futureListPage, futurePage, newFuturePage } from './future';
export { homePage } from './home';
export { issueTextsPage } from './issue-texts';
export { newOutlineItemPage, outlineItemPage, outlinePage } from './outline';
export { pointTypesPage } from './point-types';
export { archivePage, poradaIndexPage, poradaMovePage, poradaPage, previewPage } from './porada';
export { myPointsPage, newPointPage, newProposalPage, pointPage } from './points';
export { newYearPage, registryPage } from './registry';
export { queuePage, reviewPointPage } from './review';
export { settingsPage } from './settings';
export { signInPage } from './sign-in';
export { userPage } from './user';
export { usersPage } from './users';
export { getViewer, optionalSignedIn, requireSignedIn } from './viewer';

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

const GALLERY_FAIL_COOKIE = 'vzornik_vyjimka';

export interface GalleryModel {
  /** Asked to fail, to see the error page (`?stav=vyjimka`, or the cookie `vzornik_vyjimka=1`). */
  readonly fail: boolean;
  /** Make the live form's stub answer `unavailable` (`?stav=nedostupne`). */
  readonly unavailable: boolean;
}

/** The pattern gallery, or null where it must not exist (production). */
export async function galleryPage(params: SearchParams): Promise<GalleryModel | null> {
  if (getContainer().environment === 'production') return null;
  // The cookie lets a test stop the failure before „Zkusit znovu“ (a query string would stay).
  const cookie = (await cookies()).get(GALLERY_FAIL_COOKIE)?.value === '1';
  const state = first(params['stav']);
  return { fail: state === 'vyjimka' || cookie, unavailable: state === 'nedostupne' };
}
