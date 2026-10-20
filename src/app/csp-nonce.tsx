'use client';

import { useState } from 'react';

/**
 * React Aria reads this nonce for the <style> it inserts at run time (ADR 0012).
 * The first value is kept: a refresh of the server components re-renders the
 * root layout with another response's nonce, which this document's CSP refuses.
 */
export function CspNonce({ nonce }: { readonly nonce: string | null }) {
  const [first] = useState(nonce);
  return first === null ? null : <meta name="csp-nonce" nonce={first} />;
}
