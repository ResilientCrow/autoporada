import type { ReactNode } from 'react';

import { Cluster } from '@/ui/kit';

/** The row that ends a form: its submit button, and any other action beside it. */
export function FormActions({ children }: { readonly children: ReactNode }) {
  return <Cluster>{children}</Cluster>;
}
