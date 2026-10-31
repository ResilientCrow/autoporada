import Link from 'next/link';

/** The title of a row in a list: bold, and a link to the item. */
export function ItemLink({
  href,
  id,
  describedBy,
  children,
}: {
  readonly href: `/${string}`;
  readonly id?: string;
  /** The id of the text that says what the link is about, when the title alone does not. */
  readonly describedBy?: string;
  readonly children: string;
}) {
  return (
    <Link
      href={href}
      id={id}
      prefetch={false}
      aria-describedby={describedBy}
      className="w-fit font-bold"
    >
      {children}
    </Link>
  );
}
