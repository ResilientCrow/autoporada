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

/** The event a field fires, bubbling, when it must be shown before it can take focus; the phone layout's toggle listens for it. */
export const REVEAL_EVENT = 'reveal';

/**
 * What it takes to show a field that is on the page but not on screen: how many
 * closed `<details>` around it to open (every one of them),
 * and whether the form's pane is hidden, so the toggle must switch to „Formulář“.
 */
export function revealSteps(state: {
  readonly closedDetails: number;
  readonly inHiddenPane: boolean;
}): {
  readonly openDetails: number;
  readonly showForm: boolean;
} {
  const count = Math.floor(state.closedDetails);
  return { openDetails: count > 0 ? count : 0, showForm: state.inHiddenPane };
}
