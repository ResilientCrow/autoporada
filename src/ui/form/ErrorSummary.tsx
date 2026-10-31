'use client';

import type { MouseEvent, Ref } from 'react';

import { form } from '@/ui/copy';
import { BulletList, Icon } from '@/ui/kit';

import { revealAndFocus } from './reveal-and-focus';
import type { SummaryEntry } from './spec';

/**
 * A linked entry moves focus to its control, opening what hides it first (a closed `<details>`,
 * the phone layout's hidden pane). An unlinked one (a path the spec lacks) is plain text.
 */
function SummaryItem({ id, text }: SummaryEntry) {
  function focusControl(event: MouseEvent<HTMLAnchorElement>) {
    const control = id === null ? null : document.getElementById(id);
    if (control === null) return;
    event.preventDefault();
    revealAndFocus(control);
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
        <BulletList>
          {items.map((item, i) => (
            // Entries can share an id (the people of one row lead to the row's one control) or a
            // text; the position tells them apart.
            <SummaryItem key={`${i}:${String(item.id)}`} id={item.id} text={item.text} />
          ))}
        </BulletList>
      </div>
    </div>
  );
}
