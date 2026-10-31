import type { ReactNode } from 'react';

/**
 * A bordered group of related fields under a legend: 16 px between the fields. With an `id` the
 * group can take focus (the error summary links to it); `disabled` takes every control in it out
 * of reach at once, and `describedBy` names the text that describes or faults the group.
 */
export function FieldGroup({
  legend,
  id,
  disabled,
  describedBy,
  children,
}: {
  readonly legend: string;
  readonly id?: string;
  readonly disabled?: boolean;
  readonly describedBy?: string;
  readonly children: ReactNode;
}) {
  return (
    <fieldset
      id={id}
      tabIndex={id === undefined ? undefined : -1}
      disabled={disabled}
      aria-describedby={describedBy}
      className="flex min-w-0 flex-col gap-4 rounded-brand border-2 border-ink p-4"
    >
      <legend className="px-1 font-bold">{legend}</legend>
      {children}
    </fieldset>
  );
}
