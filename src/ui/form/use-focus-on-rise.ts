'use client';

import { useEffect, useRef, type RefObject } from 'react';

/** Focuses `ref` when `count` rises after mount, never on mount (a page that loads with a message leaves the first Tab to the skip link). */
export function useFocusOnRise(ref: RefObject<HTMLElement | null>, count: number): void {
  const seen = useRef(count);
  useEffect(() => {
    if (count > seen.current) ref.current?.focus();
    seen.current = count;
  }, [ref, count]);
}
