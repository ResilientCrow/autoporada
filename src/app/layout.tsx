import type { Metadata } from 'next';
import { connection } from 'next/server';
import type { ReactNode } from 'react';

import { cs } from '@/ui/copy';

export const metadata: Metadata = {
  title: cs.app.name,
  description: cs.app.description,
};

/**
 * Every page is per-user and will carry a per-request CSP nonce, so nothing
 * is prerendered at build time (ADR 0001). connection() opts the whole tree
 * into request-time rendering.
 */
export default async function RootLayout({ children }: { children: ReactNode }) {
  await connection();
  // Browser extensions add classes and attributes to <html> and <body> before hydration; the
  // server never sends them. This tolerates only the two elements' own attributes.
  return (
    <html lang="cs" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
