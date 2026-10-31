import type { ReactNode } from 'react';

/** A secondary line: a date, an e-mail address, a count. */
export function Meta({ id, children }: { readonly id?: string; readonly children: ReactNode }) {
  return (
    <p id={id} className="text-sm">
      {children}
    </p>
  );
}
