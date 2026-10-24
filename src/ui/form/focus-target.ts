/**
 * When a host moves focus after a write, and where to: kept out of the hook so
 * the node test project can check it without a DOM.
 */

/**
 * Move focus after a success, or when the node focused before has left the
 * page and focus fell to the body with it. Focus the user moved is left alone.
 */
export function shouldMoveFocus(state: {
  readonly rose: boolean;
  readonly focusedGone: boolean;
  readonly focusDropped: boolean;
}): boolean {
  return state.rose || (state.focusedGone && state.focusDropped);
}

/** The first candidate that is on the page, or null. */
export function firstPresent<T>(candidates: readonly { readonly current: T | null }[]): T | null {
  return candidates.find((candidate) => candidate.current !== null)?.current ?? null;
}
