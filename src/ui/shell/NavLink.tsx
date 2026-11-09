import Link from 'next/link';

/**
 * A link of the header navigation (arch-ui): a pill, grey text at rest, ink on a grey wash when
 * it is the current page, which `aria-current` says as well (never colour alone: the weight changes).
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
    ? 'bg-wash font-bold text-ink'
    : 'font-medium text-mut hover:bg-wash hover:text-ink';
  return (
    <Link
      href={href}
      prefetch={false}
      aria-current={current ? 'page' : undefined}
      className={`inline-flex min-h-11 items-center rounded-brand px-3 whitespace-nowrap no-underline ${look}`}
    >
      {children}
    </Link>
  );
}
