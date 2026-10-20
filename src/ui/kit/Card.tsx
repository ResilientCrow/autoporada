import type { ReactNode } from 'react';

/** A panel on the light-blue surface; its title, if any, is a heading of the page's outline. */
export function Card({
  title,
  level = 2,
  children,
}: {
  title?: string;
  level?: 2 | 3;
  children: ReactNode;
}) {
  const Heading = `h${level}` as const;
  return (
    <div className="rounded-brand bg-sublight p-4">
      {title !== undefined && <Heading className="mb-2 text-xl">{title}</Heading>}
      {children}
    </div>
  );
}
