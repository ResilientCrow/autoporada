import type { Ref } from 'react';

import { cx } from './cx';

type Level = 1 | 2 | 3;

/** Size steps by heading level; a label without one is as small as level 3. */
const SIZE: Record<Level, string> = {
  1: 'text-4xl leading-tight sm:text-5xl',
  2: 'text-2xl',
  3: 'text-xl',
};

/**
 * A slanted title block. The background is the skewed element itself (never a
 * pseudo-element, which axe cannot measure) and the text is skewed back upright.
 * With a level it is the page's heading, otherwise inline decoration.
 */
export function SlantLabel({
  level,
  focusRef,
  focusId,
  children,
}: {
  readonly level?: Level;
  /** Makes the title a place focus can be sent to (a page that moves focus after a write). */
  readonly focusRef?: Ref<HTMLHeadingElement>;
  /** The same by id, for a client host that does not render the title (a server-rendered page). */
  readonly focusId?: string;
  readonly children: string;
}) {
  const Tag = level ? (`h${level}` as const) : 'span';
  return (
    <Tag
      ref={focusRef}
      id={focusId}
      tabIndex={focusRef === undefined && focusId === undefined ? undefined : -1}
      className={cx('font-slab font-bold tracking-tight text-ink', SIZE[level ?? 3])}
    >
      {children}
    </Tag>
  );
}
