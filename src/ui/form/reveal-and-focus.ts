import { REVEAL_EVENT, revealSteps } from './focus-target';

/**
 * Brings a field to where it can take focus, then focuses it: every closed `<details>` around
 * it is opened, and when the pane it stands in is hidden (the phone layout shows one of the
 * form and the preview) a bubbling `reveal` event asks the toggle for the form. The pane is
 * judged by the outermost closed `<details>` (or the field itself): that box is drawn when
 * its pane is, whether it is open or not. Only the browser can say what it draws, so the
 * end-to-end tests check this, and `revealSteps` holds the decision.
 *
 * Call it from an event handler (such as a readiness link's click), never from an effect: the
 * toggle's `reveal` listener switches the pane with `flushSync`, which React allows only
 * outside rendering and effects.
 *
 * @public Row 36's readiness links are its first consumer.
 */
export function revealAndFocus(element: HTMLElement): void {
  const closed: HTMLDetailsElement[] = [];
  for (
    let details = element.parentElement?.closest('details') ?? null;
    details !== null;
    details = details.parentElement?.closest('details') ?? null
  ) {
    if (!details.open) closed.push(details);
  }
  const outermost = closed.at(-1) ?? element;
  const steps = revealSteps({
    closedDetails: closed.length,
    inHiddenPane: outermost.getClientRects().length === 0,
  });
  for (const details of closed.slice(0, steps.openDetails)) details.open = true;
  if (steps.showForm) element.dispatchEvent(new CustomEvent(REVEAL_EVENT, { bubbles: true }));
  element.focus();
}
