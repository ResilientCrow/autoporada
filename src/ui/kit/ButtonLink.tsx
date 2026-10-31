import Link from 'next/link';

import { buttonStyles, type ButtonVariant } from './button-styles';

/**
 * A link to another page that looks like a button. `current` marks the page it leads to
 * (`aria-current`) and takes the primary look, for a row of filters.
 */
export function ButtonLink({
  href,
  variant = 'primary',
  current = false,
  children,
}: {
  readonly href: `/${string}`;
  readonly variant?: ButtonVariant;
  readonly current?: boolean;
  readonly children: string;
}) {
  return (
    <Link
      href={href}
      prefetch={false}
      aria-current={current ? 'page' : undefined}
      className={buttonStyles(current ? 'primary' : variant)}
    >
      {children}
    </Link>
  );
}
