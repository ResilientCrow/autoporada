'use client';

import { useSyncExternalStore } from 'react';

function subscribe(): () => void {
  return () => undefined;
}

/** False in the server HTML and while hydrating, true once React runs in the browser. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
