/**
 * Binds use cases and route specs to the process container for Next:
 * with pages, the route table and the actions, the only server code that
 * reaches it (ADR 0011, Fences).
 */
export { wrappedInfo } from './brand';
/** @public Server actions arrive with the first form (M5, src/server/actions). */
export { defineAction } from './define-action';
export { defineRoute } from './define-route';
