import { dateEcho } from './fields';

/**
 * Under a date control: the date in words, because the control shows the browser's own
 * format and this is the only Czech confirmation (design section 6). Nothing while the
 * value is empty or not a date. The control names `id` in its `aria-describedby`.
 */
export function DateEcho({ id, value }: { readonly id: string; readonly value: string | null }) {
  const text = dateEcho(value);
  return text === null ? null : <p id={id}>{text}</p>;
}
