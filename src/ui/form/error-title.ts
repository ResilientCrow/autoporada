import { form } from '@/ui/copy';

const PREFIX = `${form.errorPrefix} `;

/**
 * How many forms on the page have field issues right now. Module state is
 * acceptable: there is one document (and one title) per page, and the count is
 * what keeps two failing forms from stacking „Chyba: Chyba: …“.
 */
let withIssues = 0;

/** A form got issues: the title starts with „Chyba:“ while any form has them. */
export function enterErrorTitle(target: { title: string }): void {
  withIssues += 1;
  if (withIssues === 1) target.title = `${PREFIX}${target.title}`;
}

/**
 * A form lost its issues (fixed, or unmounted). The last one restores the
 * title, unless it no longer starts with the prefix (Next replaced it on a
 * navigation), which stays as it is.
 */
export function leaveErrorTitle(target: { title: string }): void {
  withIssues = Math.max(0, withIssues - 1);
  if (withIssues === 0 && target.title.startsWith(PREFIX)) {
    target.title = target.title.slice(PREFIX.length);
  }
}
