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
    'border-digital bg-digital text-light hover:border-navy-mid hover:bg-navy-mid data-pressed:border-navy-dark data-pressed:bg-navy-dark disabled:border-sublight disabled:bg-sublight disabled:text-navy-mid',
  secondary:
    'border-digital bg-light text-digital hover:bg-sublight data-pressed:bg-sublight disabled:border-sublight disabled:text-navy-mid',
  onDark: 'border-light bg-transparent text-light hover:bg-navy-mid data-pressed:bg-navy-mid',
};

/** The look of a button, for a React Aria Button, an `<a>` or a native button alike. */
export function buttonStyles(variant: ButtonVariant = 'primary'): string {
  return cx(BASE, VARIANTS[variant]);
}
