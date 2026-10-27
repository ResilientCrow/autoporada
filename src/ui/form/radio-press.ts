/** A press on a radio of a controlled group: the choice goes on unless the group is read-only. */
export function chooseOnPress(
  value: string,
  readOnly: boolean,
  onChange: ((value: string) => void) | undefined,
): void {
  if (!readOnly) onChange?.(value);
}

/**
 * A press on a radio of an uncontrolled group: the browser would check it on its own, so
 * a read-only group takes the press back. (A controlled group is put back by React.)
 */
export function keepOnPress(readOnly: boolean, event: { preventDefault: () => void }): void {
  if (readOnly) event.preventDefault();
}
