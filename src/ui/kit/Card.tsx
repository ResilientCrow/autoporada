import type { ReactNode, Ref } from 'react';

/**
 * A panel on the light-blue surface; its title, if any, is a heading of the
 * page's outline. With `headingRef` the heading can take focus, for a card
 * that says what happened after a change.
 */
export function Card({
  title,
  level = 2,
  headingRef,
  children,
}: {
  readonly title?: string;
  readonly level?: 2 | 3;
  readonly headingRef?: Ref<HTMLHeadingElement>;
  readonly children: ReactNode;
}) {
  const Heading = `h${level}` as const;
  return (
    <div className="rounded-brand bg-sublight p-4">
      {title !== undefined && (
        <Heading
          ref={headingRef}
          tabIndex={headingRef === undefined ? undefined : -1}
          className="mb-2 text-xl"
        >
          {title}
        </Heading>
      )}
      {children}
    </div>
  );
}
