'use client';

import { useId } from 'react';

import { SALUTATION, SALUTATIONS, type Salutation } from '@/domain/cs';
import { buttonStyles } from '@/ui/kit';

/**
 * A bulk salutation setter: a label and one button per salutation. The buttons'
 * names say what they set (`setLabel`), so each reads whole on its own.
 */
export function SalutationButtons({
  label,
  setLabel,
  onPick,
}: {
  readonly label: string;
  readonly setLabel: (salutation: string) => string;
  readonly onPick: (salutation: Salutation) => void;
}) {
  const id = useId();
  return (
    <div role="group" aria-labelledby={id} className="flex flex-wrap items-center gap-2">
      <span id={id} className="font-bold">
        {label}
      </span>
      {SALUTATIONS.map((salutation) => (
        <button
          key={salutation}
          type="button"
          aria-label={setLabel(SALUTATION[salutation].label)}
          onClick={() => onPick(salutation)}
          className={buttonStyles('secondary')}
        >
          {SALUTATION[salutation].label}
        </button>
      ))}
    </div>
  );
}
