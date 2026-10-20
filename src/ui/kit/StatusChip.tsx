import { cx } from './cx';
import { Icon, type IconName } from './Icon';

type Tone = 'neutral' | 'waiting' | 'done' | 'attention' | 'stopped';

/** Each tone has its own icon, so status never relies on colour alone. */
const LOOK: Record<Tone, { readonly icon: IconName; readonly classes: string }> = {
  neutral: { icon: 'dot', classes: 'border-ink bg-light text-ink' },
  waiting: { icon: 'clock', classes: 'border-transparent bg-sublight text-ink' },
  done: { icon: 'check', classes: 'border-transparent bg-navy-mid text-light' },
  attention: { icon: 'exclamation', classes: 'border-transparent bg-accent text-ink' },
  stopped: { icon: 'cross', classes: 'border-transparent bg-ink text-light' },
};

/**
 * A status label. Domain statuses are mapped to tones in the ui/status module,
 * never by features. `attention` is only for „Vráceno“ and a deadline under
 * 24 hours. Not a live region: a change of status is announced elsewhere.
 */
export function StatusChip({ tone, children }: { readonly tone: Tone; readonly children: string }) {
  const { icon, classes } = LOOK[tone];
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-brand border px-2 py-0.5 text-sm font-bold',
        classes,
      )}
    >
      <Icon name={icon} />
      {children}
    </span>
  );
}
