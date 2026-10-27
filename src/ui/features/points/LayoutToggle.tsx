'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';

import { points } from '@/ui/copy';
import { REVEAL_EVENT, useHydrated } from '@/ui/form';

type Pane = 'form' | 'preview';

const PANES = [
  { value: 'form', label: points.layout.form },
  { value: 'preview', label: points.layout.preview },
] as const satisfies readonly { readonly value: Pane; readonly label: string }[];

/**
 * The form and its preview. From the wide layout (Tailwind `lg:`, 1024 px) they stand side by
 * side, the preview following the page; below it a native radio group switches which one
 * shows, the form first. Both are always in the markup: the hidden one only by a class, so
 * the form works before the page hydrates. The radios do nothing until then, so they stay
 * hidden until it has, and without scripts the form shows alone. A field that must be shown asks for the form
 * with the bubbling `reveal` event (`revealAndFocus`), and the switch is flushed at once so
 * the field can take focus in the same turn.
 */
export function LayoutToggle({
  form,
  preview,
}: {
  readonly form: ReactNode;
  readonly preview: ReactNode;
}) {
  const [pane, setPane] = useState<Pane>('form');
  const hydrated = useHydrated();
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = root.current;
    if (element === null) return;
    const show = () => flushSync(() => setPane('form'));
    element.addEventListener(REVEAL_EVENT, show);
    return () => element.removeEventListener(REVEAL_EVENT, show);
  }, []);
  return (
    <div ref={root} className="space-y-4">
      <fieldset className={hydrated ? 'flex flex-wrap items-center gap-x-6 lg:hidden' : 'hidden'}>
        <legend className="font-bold">{points.layout.legend}</legend>
        {PANES.map(({ value, label }) => (
          <label key={value} className="flex min-h-11 items-center gap-3">
            <input
              type="radio"
              name="layout"
              value={value}
              checked={pane === value}
              onChange={() => setPane(value)}
              className="size-6 shrink-0 accent-digital"
            />
            <span>{label}</span>
          </label>
        ))}
      </fieldset>
      <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
        <div className={pane === 'form' ? undefined : 'hidden lg:block'}>{form}</div>
        <div
          className={
            pane === 'preview' ? 'lg:sticky lg:top-4' : 'hidden lg:sticky lg:top-4 lg:block'
          }
        >
          {preview}
        </div>
      </div>
    </div>
  );
}
