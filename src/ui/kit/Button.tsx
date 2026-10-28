'use client';

import type { ReactNode, Ref } from 'react';
import { Button as AriaButton } from 'react-aria-components/Button';

import { buttonStyles, type ButtonVariant } from './button-styles';

/**
 * React Aria's Button, because `isPending` keeps focus on the button and later
 * dialog and menu triggers need its press context. Its runtime <style> takes
 * the nonce from the csp-nonce meta (ADR 0012).
 */
export function Button({
  variant = 'primary',
  type = 'button',
  name,
  value,
  onPress,
  isDisabled,
  isPending,
  describedBy,
  ref,
  children,
}: {
  readonly variant?: ButtonVariant;
  readonly type?: 'button' | 'submit';
  readonly name?: string;
  readonly value?: string;
  readonly onPress?: () => void;
  readonly isDisabled?: boolean;
  readonly isPending?: boolean;
  /** The id of the text that describes the button. */
  readonly describedBy?: string;
  /** Where focus goes back to when what the button opened closes. */
  readonly ref?: Ref<HTMLButtonElement>;
  readonly children: ReactNode;
}) {
  return (
    <AriaButton
      ref={ref}
      className={buttonStyles(variant)}
      type={type}
      name={name}
      value={value}
      onPress={onPress}
      isDisabled={isDisabled}
      isPending={isPending}
      aria-describedby={describedBy}
    >
      {children}
    </AriaButton>
  );
}
