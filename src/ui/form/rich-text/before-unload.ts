/** The browser's own leave dialog; older Safari wants `returnValue` set as well as `preventDefault`. */
export function askBeforeUnload(event: BeforeUnloadEvent): void {
  event.preventDefault();
  event.returnValue = '';
}
