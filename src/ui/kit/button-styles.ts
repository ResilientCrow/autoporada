import { cx } from './cx';

export type ButtonVariant = 'primary' | 'secondary' | 'onDark';

const BASE =
  'inline-flex w-fit min-h-11 cursor-pointer items-center justify-center rounded-brand border-2 px-4 py-2 font-bold no-underline disabled:cursor-not-allowed data-pending:cursor-progress';

/**
 * Hover uses the native pseudo-class, a press (no native signal) React Aria's
 * data-pressed. Never opacity: it would break the contrast. Focus is the base
 * layer's outline.
 */
const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'border-accent bg-accent text-ink hover:border-accent-hover hover:bg-accent-hover data-pressed:border-accent-press data-pressed:bg-accent-press disabled:border-sublight disabled:bg-sublight disabled:text-mut',
  secondary:
    'border-ink bg-light text-ink hover:bg-wash data-pressed:bg-sublight disabled:border-sublight disabled:text-mut',
  onDark: 'border-light bg-transparent text-light hover:bg-navy-mid data-pressed:bg-navy-mid',
};

/** The look of a button, for a React Aria Button, an `<a>` or a native button alike. */
export function buttonStyles(variant: ButtonVariant = 'primary'): string {
  return cx(BASE, VARIANTS[variant]);
}
