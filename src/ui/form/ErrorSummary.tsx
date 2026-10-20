'use client';

import type { MouseEvent, Ref } from 'react';

import { form } from '@/ui/copy';
import { Icon } from '@/ui/kit';

import type { SummaryEntry } from './spec';

/**
 * A linked entry scrolls the field's label into view, then focuses the control
 * without a second scroll. An unlinked one (a path the spec lacks) is plain text.
 */
function SummaryItem({ id, text }: SummaryEntry) {
  function focusControl(event: MouseEvent<HTMLAnchorElement>) {
    const control = id === null ? null : document.getElementById(id);
    if (control === null) return;
    event.preventDefault();
    const label =
      control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement
        ? control.labels?.[0]
        : undefined;
    (label ?? control).scrollIntoView({ block: 'center' });
    control.focus({ preventScroll: true });
  }

  if (id === null) return <li>{text}</li>;
  return (
    <li>
      <a href={`#${id}`} onClick={focusControl}>
        {text}
      </a>
    </li>
  );
}

/**
 * The list of problems at the top of a failed form. The outer element takes
 * focus (see `Form`); the nested alert is what is announced, so the focus move
 * and the announcement do not race.
 */
export function ErrorSummary({
  items,
  summaryRef,
}: {
  readonly items: readonly SummaryEntry[];
  readonly summaryRef: Ref<HTMLDivElement>;
}) {
  return (
    <div
      ref={summaryRef}
      tabIndex={-1}
      className="rounded-brand border-l-8 border-ink bg-light p-3 text-ink"
    >
      <div role="alert" className="flex flex-col gap-2">
        <h2 className="flex items-center gap-2">
          <Icon name="exclamation" />
          {form.summaryTitle}
        </h2>
        <ul className="list-disc pl-6">
          {items.map((item, i) => (
            // Unlinked entries can share a generic text; ids are unique.
            <SummaryItem key={item.id ?? `unlinked-${i}`} id={item.id} text={item.text} />
          ))}
        </ul>
      </div>
    </div>
  );
}
