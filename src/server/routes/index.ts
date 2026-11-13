/** Route handlers for src/app; each route file exports one of these per method. */
import { authRouteSpecs } from '../auth';
import { getContainer } from '../container';
import { defineRoute } from '../bind';
import { directoryRouteSpec } from './directory';
import { documentRouteSpec } from './documents';
import { ARCH_STYLESHEET, archPageSpec } from './arch-page';
import { archRunSpec, archStateSpec } from './arch-run';

const auth = authRouteSpecs(() => getContainer().auth);

export const authLogin = defineRoute(auth.login);
export const authCallback = defineRoute(auth.callback);
export const authLogout = defineRoute(auth.logout);
export const authStepUp = defineRoute(auth.stepUp);

export const directorySearch = defineRoute(directoryRouteSpec(() => getContainer()));

export const documentDownload = defineRoute(documentRouteSpec);

// Branch arch-ui: the Arch UI page and its two endpoints.
export const archPage = defineRoute(archPageSpec);
export const archState = defineRoute(archStateSpec);
export const archRun = defineRoute(archRunSpec);
export { ARCH_STYLESHEET };
