import Link from 'next/link';

/** A link to another page of the app inside a sentence: the base look, underlined. Not prefetched (see ArrowLink). */
export function TextLink({
  href,
  children,
}: {
  /** A path of the app, query allowed (a page may only know it as a string, like the current location). */
  readonly href: string;
  readonly children: string;
}) {
  return (
    <Link href={href} prefetch={false}>
      {children}
    </Link>
  );
}
