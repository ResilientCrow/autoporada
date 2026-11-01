import type { ReactNode, Ref } from 'react';

import { cx } from './cx';

/**
 * A panel on the light-blue surface; its title, if any, is a heading of the
 * page's outline. With `headingRef` the heading can take focus, for a card
 * that says what happened after a change. `aside` (a control for the whole
 * card) sits at its right from `sm` up and under the content below it.
 */
export function Card({
  title,
  level = 2,
  headingRef,
  aside,
  children,
}: {
  readonly title?: string;
  readonly level?: 2 | 3;
  readonly headingRef?: Ref<HTMLHeadingElement>;
  readonly aside?: ReactNode;
  readonly children: ReactNode;
}) {
  const body = (
    <Body title={title} level={level} headingRef={headingRef}>
      {children}
    </Body>
  );
  if (aside === undefined) return <Panel>{body}</Panel>;
  return (
    <Panel row>
      <div className="flex min-w-0 flex-1 flex-col gap-3">{body}</div>
      <div className="shrink-0">{aside}</div>
    </Panel>
  );
}

function Panel({
  row = false,
  children,
}: {
  readonly row?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <div
      className={cx(
        'flex flex-col rounded-brand bg-sublight p-4 sm:p-6',
        row ? 'gap-4 sm:flex-row sm:items-center sm:justify-between' : 'gap-3',
      )}
    >
      {children}
    </div>
  );
}

function Body({
  title,
  level,
  headingRef,
  children,
}: {
  readonly title?: string;
  readonly level: 2 | 3;
  readonly headingRef?: Ref<HTMLHeadingElement>;
  readonly children: ReactNode;
}) {
  const Heading = `h${level}` as const;
  return (
    <>
      {title !== undefined && (
        <Heading
          ref={headingRef}
          tabIndex={headingRef === undefined ? undefined : -1}
          className="text-lg"
        >
          {title}
        </Heading>
      )}
      <div className="flex flex-col gap-4">{children}</div>
    </>
  );
}
