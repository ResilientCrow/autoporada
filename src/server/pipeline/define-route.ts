import { getContainer } from '../container';
import { markWrapped } from './brand';
import { runRoute, type RouteSpec, type Segment } from './run-route';

export type RouteHandler = (request: Request, segment: Segment) => Promise<Response>;

/** The only way to make a route handler (ADR 0011): `export const GET = handler;`. */
export function defineRoute(spec: RouteSpec): RouteHandler {
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
