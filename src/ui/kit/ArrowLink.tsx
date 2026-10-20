import Link from 'next/link';

/**
 * A link to another page of the app, never to /auth/* (each start stores a
 * sign-in) and never external. Not prefetched: every route is dynamic and
 * per-user, and a prefetch would skip the proxy. The arrow is decoration, drawn
 * as an SVG: axe cannot measure the contrast of a glyph and leaves it "incomplete".
 */
export function ArrowLink({ href, children }: { href: `/${string}`; children: string }) {
  return (
    <Link href={href} prefetch={false} className="font-bold">
      {children}{' '}
      <svg
        aria-hidden="true"
        focusable="false"
        viewBox="0 0 16 16"
        className="inline-block size-4 align-text-bottom"
        fill="currentColor"
      >
        <path d="M8 1.5 6.9 2.6l4.6 4.6H1.5v1.6h10l-4.6 4.6L8 14.5 14.5 8z" />
      </svg>
    </Link>
  );
}
