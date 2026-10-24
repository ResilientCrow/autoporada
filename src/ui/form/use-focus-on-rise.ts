'use client';

import { useEffect, useRef, type RefObject } from 'react';

import { firstPresent, shouldMoveFocus } from './focus-target';

/**
 * Focuses the first of `candidates` that is on the page when `count` rises after
 * mount. A page that refreshes after the write can drop the sent target a render
 * later, so while the node focused is gone the next candidate takes over, but
 * only if focus fell to the body with it: focus the user moved is left alone.
 */
export function useFocusFirstOnRise(
  count: number,
  candidates: readonly RefObject<HTMLElement | null>[],
): void {
  const seen = useRef(count);
  const focused = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const rose = count > seen.current;
    seen.current = count;
    const focusedGone = focused.current !== null && !focused.current.isConnected;
    const focusDropped =
      document.activeElement === null || document.activeElement === document.body;
    if (!shouldMoveFocus({ rose, focusedGone, focusDropped })) return;
    focused.current = firstPresent(candidates);
    focused.current?.focus();
  });
}

/** Focuses `ref` when `count` rises after mount, never on mount (a page that loads with a message leaves the first Tab to the skip link). */
export function useFocusOnRise(ref: RefObject<HTMLElement | null>, count: number): void {
  const seen = useRef(count);
  useEffect(() => {
    if (count > seen.current) ref.current?.focus();
    seen.current = count;
  }, [ref, count]);
}
