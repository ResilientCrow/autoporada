import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { cs } from '@/ui/copy/cs';

export const metadata: Metadata = {
  title: cs.app.name,
  description: cs.app.description,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="cs">
      <body>{children}</body>
    </html>
  );
}
