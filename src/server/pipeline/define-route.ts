import { getContainer } from '../container';
import { LIMITS } from '../rate-limit';
import { markWrapped } from './brand';
import { runRoute, type RouteSpec, type Segment } from './run-route';

export type RouteHandler = (request: Request, segment: Segment) => Promise<Response>;

/** The only way to make a route handler (ADR 0011): `export const GET = handler;`. */
export function defineRoute(spec: RouteSpec): RouteHandler {
  // Anonymous callers have no user to count: a public route limits by address or not at all.
  if (
    spec.access === 'public' &&
    spec.rateLimit !== 'none' &&
    LIMITS[spec.rateLimit].key === 'user'
  ) {
    throw new Error(`${spec.name}: a public route can only be limited by client address`);
  }
  const handler: RouteHandler = (request, segment) =>
    runRoute(getContainer(), spec, request, segment);
  markWrapped(handler, {
    kind: 'route',
    name: spec.name,
    access: spec.access,
    rateLimit: spec.rateLimit,
  });
  return handler;
}
