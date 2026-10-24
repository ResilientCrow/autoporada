'use client';

import { useSyncExternalStore } from 'react';

const noSubscription = () => () => undefined;

/** The nonce the document's own scripts carry; '' (an unset .nonce) counts as none. */
function documentNonce(): string | null {
  return document.querySelector<HTMLScriptElement>('script[nonce]')?.nonce || null;
}

/**
 * React Aria reads this nonce for the <style> it inserts at run time (ADR 0012).
 * The document's own nonce wins over the prop: a refresh or a retry from
 * global-error renders the root layout with another response's nonce, which
 * this document's CSP refuses. The server snapshot is the prop, so hydration matches.
 */
export function CspNonce({ nonce }: { readonly nonce: string | null }) {
  const current = useSyncExternalStore(
    noSubscription,
    () => documentNonce() ?? nonce,
    () => nonce,
  );
  return current === null ? null : <meta name="csp-nonce" nonce={current} />;
}
