import type { ReactNode, Ref } from 'react';

import { SlantLabel } from './SlantLabel';

/**
 * The top of every page: the title (the page's one h1) and, under it, a row of what describes
 * it: a status chip, a date, a type.
 */
export function PageHeader({
  title,
  focusRef,
  focusId,
  children,
}: {
  readonly title: string;
  readonly focusRef?: Ref<HTMLHeadingElement>;
  readonly focusId?: string;
  readonly children?: ReactNode;
}) {
  return (
    <header className="flex flex-col items-start gap-3">
      <SlantLabel level={1} focusRef={focusRef} focusId={focusId}>
        {title}
      </SlantLabel>
      {children !== undefined && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">{children}</div>
      )}
    </header>
  );
}
