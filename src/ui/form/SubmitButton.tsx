'use client';

import type { ReactNode } from 'react';

import { Button, type ButtonVariant } from '@/ui/kit';

import { useFormContext } from './context';
import { useHydrated } from './use-hydrated';

/**
 * A submit button. The one pressed is pending, which keeps its focus and blocks
 * more presses; it is never disabled, or it would lose focus. Every other one is
 * disabled while a submit is in flight and in the server HTML, so a form
 * without JavaScript cannot send (not even by Enter in a field).
 */
export function SubmitButton({
  name,
  value,
  variant = 'primary',
  children,
}: {
  readonly name?: string;
  readonly value?: string;
  readonly variant?: ButtonVariant;
  readonly children: ReactNode;
}) {
  const { submitting } = useFormContext();
  const hydrated = useHydrated();
  const pressed = submitting !== null && submitting === (value ?? '');
  return (
    <Button
      type="submit"
      name={name}
      value={value}
      variant={variant}
      isPending={pressed}
      isDisabled={!pressed && (!hydrated || submitting !== null)}
    >
      {children}
    </Button>
  );
}
