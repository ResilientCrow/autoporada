/**
 * A labelled native checkbox for a form field that is optional by nature (a bullet that is not
 * required, a type that is off): unlike the kit's, it adds no „(nepovinné)“ to its label.
 */
export function Check({
  id,
  name,
  label,
  defaultChecked,
}: {
  readonly id: string;
  readonly name: string;
  readonly label: string;
  readonly defaultChecked: boolean;
}) {
  return (
    <label htmlFor={id} className="flex min-h-11 items-start gap-3 font-bold">
      <input
        id={id}
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="size-6 shrink-0 accent-digital"
      />
      <span>{label}</span>
    </label>
  );
}
