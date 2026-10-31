import type { MouseEvent } from 'react';

/**
 * A link to a place on the same page. A block of its own with 4 px above and below, so in a list
 * the target is the 24 px that WCAG 2.2 asks for. `onClick` lets the page move focus itself.
 */
export function InPageLink({
  id,
  onClick,
  children,
}: {
  /** The id of the target, without the hash. */
  readonly id: string;
  readonly onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
  readonly children: string;
}) {
  return (
    <a href={`#${id}`} onClick={onClick} className="inline-block w-fit py-1">
      {children}
    </a>
  );
}
