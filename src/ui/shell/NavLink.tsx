import Link from 'next/link';

/**
 * A link of the header navigation: bold, no underline at rest, a 2 px one on hover. The current
 * page is marked by a thick underline as well as `aria-current`, never colour alone.
 */
export function NavLink({
  href,
  current,
  children,
}: {
  readonly href: `/${string}`;
  readonly current: boolean;
  readonly children: string;
}) {
  const look = current
    ? 'underline decoration-4 underline-offset-8'
    : 'no-underline hover:underline hover:decoration-2';
  return (
    <Link
      href={href}
      prefetch={false}
      aria-current={current ? 'page' : undefined}
      className={`inline-flex min-h-11 items-center font-bold ${look}`}
    >
      {children}
    </Link>
  );
}
