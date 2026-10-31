import type { ReactNode } from 'react';

import { Icon } from './Icon';

/**
 * A native `<details>`: it works without JavaScript. The summary is the control, so it is at
 * least 44 px high; the chevron turns when the section is open.
 */
export function Disclosure({
  summary,
  children,
}: {
  readonly summary: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <details className="group">
      <summary className="summary-plain flex min-h-11 w-fit cursor-pointer items-center gap-2 font-bold">
        <span className="inline-flex group-open:rotate-90">
          <Icon name="chevron" />
        </span>
        {summary}
      </summary>
      <div className="flex flex-col gap-4 pt-3">{children}</div>
    </details>
  );
}
