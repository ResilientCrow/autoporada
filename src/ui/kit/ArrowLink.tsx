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
}: {
  readonly href: `/${string}`;
  readonly children: string;
}) {
  return (
    <Link href={href} prefetch={false} className="font-bold">
      {children} <Icon name="arrow" />
    </Link>
  );
}
