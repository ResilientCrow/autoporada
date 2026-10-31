import type { ReactNode, Ref } from 'react';

import { BackLink } from './BackLink';
import { SlantLabel } from './SlantLabel';

/**
 * The top of every page: the title (the page's one h1) and, under it, a row of what describes
 * it: a status chip, a date, a type.
 */
export function PageHeader({
  title,
  back,
  focusRef,
  focusId,
  children,
}: {
  readonly title: string;
  /** The page this one came from; always above the title, never at the bottom. */
  readonly back?: { readonly href: `/${string}`; readonly label: string };
  readonly focusRef?: Ref<HTMLHeadingElement>;
  readonly focusId?: string;
  readonly children?: ReactNode;
}) {
  return (
    <header className="flex flex-col items-start gap-3">
      {back !== undefined && <BackLink href={back.href}>{back.label}</BackLink>}
      <SlantLabel level={1} focusRef={focusRef} focusId={focusId}>
        {title}
      </SlantLabel>
      {children !== undefined && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">{children}</div>
      )}
    </header>
  );
}
