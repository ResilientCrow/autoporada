import Link from 'next/link';

import { Icon } from './Icon';

/**
 * A link to another page of the app, never to /auth/* (each start stores a
 * sign-in) and never external. Not prefetched: every route is dynamic and
 * per-user, and a prefetch would skip the proxy. The arrow is decoration, drawn
 * as an SVG: axe cannot measure the contrast of a glyph and leaves it "incomplete".
 */
export function ArrowLink({
  href,
  children,
  describedBy,
}: {
  readonly href: `/${string}`;
  readonly children: string;
  /** The id of the text that says what the link is about, when the label alone does not. */
  readonly describedBy?: string;
}) {
  return (
    <Link href={href} prefetch={false} aria-describedby={describedBy} className="font-bold">
      {children} <Icon name="arrow" />
    </Link>
  );
}
