import type { ReactNode, Ref } from 'react';

import { cx } from './cx';

/**
 * A part of a page under its own heading, on the page itself (a Card is the panel). Heading to
 * content is 12 px, blocks in the body 16 px. `divided` sets it off with a rule above, for a
 * second kind of action under a form. With `headingId` the section is named by its heading.
 */
export function Section({
  title,
  level = 2,
  headingId,
  headingRef,
  divided = false,
  children,
}: {
  readonly title: string;
  readonly level?: 2 | 3;
  readonly headingId?: string;
  readonly headingRef?: Ref<HTMLHeadingElement>;
  readonly divided?: boolean;
  readonly children: ReactNode;
}) {
  const Heading = `h${level}` as const;
  return (
    <section
      aria-labelledby={headingId}
      className={cx('flex flex-col gap-3', divided && 'border-t border-ink pt-6')}
    >
      <Heading id={headingId} ref={headingRef} tabIndex={headingRef === undefined ? undefined : -1}>
        {title}
      </Heading>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}
