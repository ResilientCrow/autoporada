import Link from 'next/link';

import { Icon } from './Icon';

/** „Zpět na …“: the way back to the list or page this one came from. Only `PageHeader` draws it, above the title. */
export function BackLink({
  href,
  children,
}: {
  readonly href: `/${string}`;
  readonly children: string;
}) {
  return (
    <Link href={href} prefetch={false} className="w-fit">
      <Icon name="back" />
      {'\u00a0'}
      {children}
    </Link>
  );
}
