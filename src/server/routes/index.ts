/** Route handlers for src/app; each route file exports one of these per method. */
import { authRouteSpecs } from '../auth';
import { getContainer } from '../container';
import { defineRoute } from '../entry';

const auth = authRouteSpecs(() => getContainer().auth);

export const authLogin = defineRoute(auth.login);
export const authCallback = defineRoute(auth.callback);
export const authLogout = defineRoute(auth.logout);
export const authStepUp = defineRoute(auth.stepUp);
