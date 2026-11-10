import type { ReactNode } from 'react';

import { cx } from './cx';
import { Icon } from './Icon';

const LOOK = {
  info: { icon: 'info', classes: 'rounded-brand bg-cream', role: 'status' },
  problem: {
    icon: 'exclamation',
    classes: 'rounded-brand border-2 border-danger bg-light',
    role: 'alert',
  },
} as const;

/**
 * A message with an icon and a left border, so tone is shape as well as colour.
 * It announces itself (status or alert) unless `live` is false: pass false for
 * what is already on the page when it loads.
 */
export function Notice({
  tone,
  live = true,
  children,
}: {
  readonly tone: 'info' | 'problem';
  readonly live?: boolean;
  readonly children: ReactNode;
}) {
  const { icon, classes, role } = LOOK[tone];
  return (
    <div
      role={live ? role : undefined}
      className={cx('flex gap-2 rounded-brand p-3 text-ink', classes)}
    >
      <Icon name={icon} />
      <div>{children}</div>
    </div>
  );
}
