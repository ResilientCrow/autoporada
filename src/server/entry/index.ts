/**
 * Next's entry points, bound to the process container: the only server
 * code besides pages and the route table that reaches it (ADR 0011).
 */
export { wrappedInfo } from './brand';
/** @public Server actions arrive with the first form (M5, src/server/actions). */
export { defineAction } from './define-action';
export { defineRoute } from './define-route';
