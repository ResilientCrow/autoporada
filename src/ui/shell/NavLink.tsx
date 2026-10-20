import Link from 'next/link';

/** The current page is marked by a thick underline as well as `aria-current`, never colour alone. */
export function NavLink({
  href,
  current,
  children,
}: {
  readonly href: `/${string}`;
  readonly current: boolean;
  readonly children: string;
}) {
  const ariaCurrent = current ? 'page' : undefined;
  const marker = current ? 'decoration-4' : 'decoration-1';
  return (
    <Link href={href} prefetch={false} aria-current={ariaCurrent} className={`font-bold ${marker}`}>
      {children}
    </Link>
  );
}
