import { fieldId } from '@/ui/form';

import type { RowFocus } from './rows';

/**
 * Puts focus where `target` says, in the bullet list of the form `formId`: the list is a
 * fieldset whose direct children are the row fieldsets, then the add button; a row's only button
 * is its remove button.
 */
export function focusRow(formId: string, target: RowFocus): void {
  const list = document.getElementById(fieldId(formId, 'defaultBullets'));
  if (target === 'add') return list?.querySelector<HTMLElement>(':scope > button')?.focus();
  if (target.control === 'label') {
    return document.getElementById(fieldId(formId, `defaultBullets.${target.row}.label`))?.focus();
  }
  list
    ?.querySelectorAll(':scope > fieldset')
    [target.row]?.querySelector<HTMLElement>('button')
    ?.focus();
}

/** Puts focus on the submit button of the form `formId`. */
export function focusSubmit(formId: string): void {
  document.getElementById(formId)?.querySelector<HTMLElement>('button[type="submit"]')?.focus();
}
