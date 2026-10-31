'use client';

import { useState } from 'react';

import { registry } from '@/ui/copy';
import { LiveStatus } from '@/ui/form';
import { ArrowLink, Card, SlantLabel } from '@/ui/kit';

import type { AddEntriesAction, RemoveEntryAction, SaveEntryAction } from './actions';
import { AddEntryForm } from './EntryForm';
import { EntryRow, type EntryView } from './EntryRow';

/** /registr/[klic]: the list and its entries in the document's order. */
export interface EntriesView {
  readonly list: { readonly id: string; readonly key: string; readonly title: string };
  readonly entries: readonly EntryView[];
  readonly canEdit: boolean;
}

/**
 * The host of one list: its students, and for the headmaster the add form, „Vložit seznam“ and a
 * row's „Upravit“ and „Odebrat“. The add form is keyed by the number of students added, so it
 * starts empty after a save.
 */
export function Entries({
  view,
  addEntries,
  saveEntry,
  removeEntry,
}: {
  readonly view: EntriesView;
  readonly addEntries: AddEntriesAction;
  readonly saveEntry: SaveEntryAction;
  readonly removeEntry: RemoveEntryAction;
}) {
  const [said, setSaid] = useState({ message: '', count: 0, added: 0 });
  const say = (message: string, added = 0) =>
    setSaid((s) => ({ message, count: s.count + 1, added: s.added + added }));
  const { list, entries, canEdit } = view;
  return (
    <>
      <SlantLabel level={1}>{list.title}</SlantLabel>
      <div className="mt-4 space-y-8">
        <p>
          <ArrowLink href="/registr">{registry.entries.back}</ArrowLink>
        </p>
        <LiveStatus message={said.message} count={said.count} />
        {canEdit && (
          <p>
            <ArrowLink href={`/registr/${list.key}/vlozit`}>{registry.entries.paste}</ArrowLink>
          </p>
        )}
        {entries.length === 0 ? (
          <p>{registry.entries.empty}</p>
        ) : (
          <ul className="space-y-3">
            {entries.map((entry) => (
              <li key={`${entry.id}-${entry.version}`}>
                <EntryRow
                  entry={entry}
                  editable={canEdit}
                  saveEntry={saveEntry}
                  removeEntry={removeEntry}
                  onSaved={(changed) =>
                    say(changed ? registry.said.changed : registry.said.unchanged)
                  }
                  onRemoved={() => say(registry.said.removed)}
                />
              </li>
            ))}
          </ul>
        )}
        {canEdit && (
          <Card level={2} title={registry.entries.add.title}>
            <AddEntryForm
              key={said.added}
              action={addEntries}
              listId={list.id}
              onAdded={() => say(registry.said.added, 1)}
            />
          </Card>
        )}
      </div>
    </>
  );
}
