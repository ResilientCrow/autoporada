'use client';

import { useState } from 'react';

import { porada } from '@/ui/copy';
import { LiveStatus } from '@/ui/form';

import { AddItem } from './AddItem';
import { OutlineRow } from './OutlineRow';
import type { OutlineActions, OutlineSectionKey, OutlineView } from './outline';

const SECTIONS: readonly OutlineSectionKey[] = ['pokyny', 'hospodareni'];

/**
 * Both sections of the porada: the items in the order the document prints them, and under each the
 * form that adds one. A form added to starts empty (keyed by the number of items added to it); a
 * row is keyed by its id, so a moved item keeps its place in the focus order of the page.
 */
export function OutlineList({
  view,
  actions,
}: {
  readonly view: OutlineView;
  readonly actions: OutlineActions;
}) {
  const [said, setSaid] = useState({ message: '', count: 0, added: 0 });
  const say = (message: string, added = 0) =>
    setSaid((s) => ({ message, count: s.count + 1, added: s.added + added }));
  const { outline } = porada;
  return (
    <div className="space-y-8">
      <LiveStatus message={said.message} count={said.count} />
      {SECTIONS.map((section) => {
        const rows = view[section];
        const headingId = `cast-${section}`;
        return (
          <section key={section} aria-labelledby={headingId} className="space-y-4">
            <h2 id={headingId} className="text-xl">
              {outline.sections[section]}
            </h2>
            {rows.length === 0 && <p>{outline.empty}</p>}
            <ul className="space-y-4">
              {rows.map((row, index) => (
                <OutlineRow
                  key={row.lineageId}
                  monday={view.monday}
                  version={view.version}
                  row={row}
                  first={index === 0}
                  last={index === rows.length - 1}
                  move={actions.move}
                  remove={actions.remove}
                  onMoved={() => say(outline.said.moved)}
                  onRemoved={() => say(outline.said.removed)}
                />
              ))}
            </ul>
            <details>
              <summary className="min-h-11 cursor-pointer font-bold">{outline.add.title}</summary>
              <div className="mt-3">
                <AddItem
                  key={`${section}-${said.added}`}
                  action={actions.add}
                  monday={view.monday}
                  version={view.version}
                  section={section}
                  onAdded={() => say(outline.said.added, 1)}
                />
              </div>
            </details>
          </section>
        );
      })}
    </div>
  );
}
