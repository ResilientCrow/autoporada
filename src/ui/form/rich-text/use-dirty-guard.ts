'use client';

import { useEffect } from 'react';

import { richtext } from '@/ui/copy';

/** The same-origin link a click was on, if it would leave this page. */
function leavingLink(event: MouseEvent): HTMLAnchorElement | null {
  if (event.defaultPrevented || event.button !== 0) return null;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  const target = event.target instanceof Element ? event.target.closest('a[href]') : null;
  if (!(target instanceof HTMLAnchorElement)) return null;
  if (target.target !== '' && target.target !== '_self') return null;
  if (target.hasAttribute('download')) return null;
  const url = new URL(target.href, window.location.href);
  if (url.origin !== window.location.origin) return null;
  const here = window.location;
  return url.pathname === here.pathname && url.search === here.search ? null : target;
}

/** The browser's own leave dialog; older Safari wants `returnValue` set as well as `preventDefault`. */
export function askBeforeUnload(event: BeforeUnloadEvent): void {
  event.preventDefault();
  event.returnValue = '';
}

/**
 * While `dirty`, leaving the page asks first (ADR 0031, item 8): the browser's own dialog for a reload
 * or a closed tab (`beforeunload`), and `confirm(richtext.unsaved)` for a click on a same-origin link,
 * caught in the capture phase so the router never sees it. The page clears `dirty` after a successful save.
 */
export function useDirtyGuard(dirty: boolean): void {
  useEffect(() => {
    if (!dirty) return;
    const click = (event: MouseEvent) => {
      if (leavingLink(event) === null) return;
      if (window.confirm(richtext.unsaved)) return;
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener('beforeunload', askBeforeUnload);
    document.addEventListener('click', click, true);
    return () => {
      window.removeEventListener('beforeunload', askBeforeUnload);
      document.removeEventListener('click', click, true);
    };
  }, [dirty]);
}
